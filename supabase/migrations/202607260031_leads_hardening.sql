-- Lead system hardening (2026-07-26): status/leadSource move from
-- unconstrained free text to a real, enforced pipeline; 'duplicate_merged'
-- is a new activity type for the dedup-on-create path in service.ts.
begin;

alter table public.leads
  add constraint leads_status_check
  check (status in ('New', 'Qualified', 'Follow-up', 'Enrolled', 'Lost'));

alter table public.lead_activities
  drop constraint lead_activities_activity_type_check;
alter table public.lead_activities
  add constraint lead_activities_activity_type_check
  check (activity_type in (
    'created', 'status_changed', 'assigned', 'unassigned',
    'score_changed', 'note_updated', 'follow_up_scheduled', 'duplicate_merged'
  ));

commit;
