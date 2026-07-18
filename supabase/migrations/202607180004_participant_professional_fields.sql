-- Add optional professional context to Participant, collected at
-- registration for staff segmentation and corporate-sponsorship follow-up
-- (founder-approved 2026-07-18).
begin;

alter table public.participants
    add column job_title text,
    add column company text;

comment on column public.participants.job_title is
    'Optional: participant''s job title, collected at registration for segmentation and follow-up.';
comment on column public.participants.company is
    'Optional: participant''s employer/institution, collected at registration for segmentation, corporate-sponsorship follow-up, and invoicing.';

-- BR-16 soft delete must anonymise these too — they can indirectly identify
-- a person when combined with the already-erased name/email/phone.
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
           job_title = null,
           company = null,
           deleted_at = now(),
           updated_at = now()
     where id = participant_id_to_delete;

    if not found then
        raise exception 'Participant not found';
    end if;
end;
$$;

commit;
