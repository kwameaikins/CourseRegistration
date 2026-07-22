-- Admin-only immediate hard delete for wrongly-entered or test data
-- (founder-approved 2026-07-22) — deliberately separate from the DPA
-- erasure flow (fn_soft_delete_participant / fn_hard_delete_participant),
-- which exists to fulfil data-subject requests and enforces a 30-day
-- cooling-off period plus a refusal when financial records exist. This
-- feature is the opposite: for cleaning up mistakes/test rows right away,
-- it deletes the Payment and Registration rows outright rather than
-- preserving them.
--
-- Every other child table (email_log, whatsapp_log, sms_log,
-- zoom_registrants, attendance, feedback, call_log, certificates,
-- portal_login_tokens) already cascades on registrations.id — only
-- payments.registration_id is "on delete restrict" (foundation migration),
-- so it must be deleted explicitly before the registration.
begin;

create table public.manual_deletion_log (
    id                  uuid primary key default gen_random_uuid(),
    entity_type         text not null check (entity_type in ('registration', 'participant')),
    participant_id      uuid not null,
    participant_name    text not null,
    -- Snapshot only — not a FK, since the registration row (and its id) no
    -- longer exists once this row is written. Null when entity_type is
    -- 'participant' (the whole participant plus every registration removed).
    registration_id     uuid,
    course_name         text,
    cohort_label        text,
    reason              text,
    deleted_by_staff_id uuid references public.staff_users(id) on delete set null,
    deleted_at          timestamptz not null default now()
);

comment on table public.manual_deletion_log is
    'Audit trail for admin-initiated immediate hard deletes of wrongly-entered/test data. Distinct from deletion_log, which audits the DPA participant-erasure flow.';

alter table public.manual_deletion_log enable row level security;

create policy admin_read_manual_deletion_log
on public.manual_deletion_log for select
to authenticated
using (public.fn_current_role() = 'admin');

create or replace function public.fn_delete_registration_immediately(
    registration_id_to_delete uuid,
    deleting_staff_id uuid,
    reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_participant_id   uuid;
    v_participant_name text;
    v_course_name      text;
    v_cohort_label     text;
begin
    if public.fn_current_role() <> 'admin'
       or public.fn_current_staff_id() is distinct from deleting_staff_id then
        raise exception 'Only the current active Admin may delete a Registration';
    end if;

    select r.participant_id, p.full_name, c.course_name, b.cohort_label
      into v_participant_id, v_participant_name, v_course_name, v_cohort_label
      from public.registrations r
      join public.participants p on p.id = r.participant_id
      join public.batches b on b.id = r.batch_id
      join public.courses c on c.id = b.course_id
     where r.id = registration_id_to_delete;

    if not found then
        raise exception 'Registration not found';
    end if;

    insert into public.manual_deletion_log (
        entity_type, participant_id, participant_name, registration_id,
        course_name, cohort_label, reason, deleted_by_staff_id
    ) values (
        'registration', v_participant_id, v_participant_name, registration_id_to_delete,
        v_course_name, v_cohort_label, reason, deleting_staff_id
    );

    delete from public.payments where registration_id = registration_id_to_delete;
    delete from public.registrations where id = registration_id_to_delete;
end;
$$;

create or replace function public.fn_delete_participant_immediately(
    participant_id_to_delete uuid,
    deleting_staff_id uuid,
    reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_participant_name text;
begin
    if public.fn_current_role() <> 'admin'
       or public.fn_current_staff_id() is distinct from deleting_staff_id then
        raise exception 'Only the current active Admin may delete a Participant';
    end if;

    select full_name into v_participant_name
      from public.participants
     where id = participant_id_to_delete;

    if not found then
        raise exception 'Participant not found';
    end if;

    insert into public.manual_deletion_log (
        entity_type, participant_id, participant_name, reason, deleted_by_staff_id
    ) values (
        'participant', participant_id_to_delete, v_participant_name, reason, deleting_staff_id
    );

    delete from public.payments
     where registration_id in (
         select id from public.registrations where participant_id = participant_id_to_delete
     );
    delete from public.registrations where participant_id = participant_id_to_delete;
    delete from public.participants where id = participant_id_to_delete;
end;
$$;

revoke all on function public.fn_delete_registration_immediately(uuid, uuid, text) from public;
revoke all on function public.fn_delete_participant_immediately(uuid, uuid, text) from public;
grant execute on function public.fn_delete_registration_immediately(uuid, uuid, text) to authenticated;
grant execute on function public.fn_delete_participant_immediately(uuid, uuid, text) to authenticated;

commit;
