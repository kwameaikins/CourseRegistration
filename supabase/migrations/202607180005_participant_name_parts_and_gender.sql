-- Split Participant name entry into First/Middle/Surname for cleaner data
-- (certificates, sorting, deduplication) and add self-selected Gender
-- (founder-approved 2026-07-18). full_name remains the single stored
-- display value — the application computes it from the parts at write time
-- so every existing consumer (email/WhatsApp templates, staff screens)
-- keeps working unchanged.
begin;

alter table public.participants
    add column first_name  text,
    add column middle_name text,
    add column surname     text,
    add column gender      text check (gender in ('Male', 'Female'));

comment on column public.participants.first_name is
    'Given name, collected as a separate registration-form field. full_name is computed from first_name/middle_name/surname at write time.';
comment on column public.participants.middle_name is
    'Optional middle name.';
comment on column public.participants.surname is
    'Family name / surname.';
comment on column public.participants.gender is
    'Self-selected at registration: Male or Female.';

-- BR-16 anonymisation must also clear the new name parts and gender.
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
           first_name = null,
           middle_name = null,
           surname = null,
           email = concat('deleted-', id, '@deleted.local'),
           phone = '[DELETED]',
           job_title = null,
           company = null,
           gender = null,
           deleted_at = now(),
           updated_at = now()
     where id = participant_id_to_delete;

    if not found then
        raise exception 'Participant not found';
    end if;
end;
$$;

commit;
