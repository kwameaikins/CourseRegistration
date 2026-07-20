-- Course certificate metadata + DPA certificate scrub (founder-approved
-- 2026-07-20, from the system review).
--
-- 1. Courses carry the certificate metadata (hours, description, CPD
--    credit) so batch issuance prefills instead of retyping per run, plus
--    certificate_serial_floor — the highest serial already used per the
--    legacy AppScript counter (some paper certificates predate the exported
--    registry, e.g. CA01 stands at 20 with no registry rows). Numbering
--    takes max(registry, floor) + 1 for 2026 issues.
-- 2. fn_soft_delete_participant now also revokes and scrubs certificates
--    linked to the erased participant's registrations — the certificate
--    stores a name snapshot that the participants-table anonymisation
--    doesn't reach.

begin;

alter table public.courses
    add column certificate_hours integer not null default 0,
    add column certificate_description text not null default '',
    add column cpd_credit text not null default 'TBD',
    add column certificate_serial_floor integer not null default 0;

comment on column public.courses.certificate_serial_floor is
    'Highest certificate serial already used for this course in 2026 (legacy AppScript counter). New serials start above max(registry, floor).';

create or replace function public.fn_soft_delete_participant(
    participant_id_to_delete uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if public.fn_current_role() <> 'admin' then
        raise exception 'Only an active Admin may delete a Participant';
    end if;

    update public.participants
       set full_name = '[DELETED]',
           email = concat('deleted-', id, '@deleted.local'),
           phone = '[DELETED]',
           deleted_at = now(),
           updated_at = now()
     where id = participant_id_to_delete;

    if not found then
        raise exception 'Participant not found';
    end if;

    -- Certificates snapshot the recipient name for public verification —
    -- revoke and scrub them so the erased identity is unreachable.
    update public.certificates
       set recipient_name = '[DELETED]',
           recipient_email = null,
           revoked = true,
           revoked_reason = coalesce(revoked_reason, 'Participant data erased (DPA)')
     where registration_id in (
        select id from public.registrations
         where participant_id = participant_id_to_delete
     );
end;
$$;

commit;
