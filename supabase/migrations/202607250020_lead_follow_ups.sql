-- Follow-up reminders (Revenue OS Phase 1 roadmap item): a due date staff
-- can set on a lead, so a "due for follow-up" view is possible without a
-- separate scheduling table.
alter table public.leads add column if not exists next_follow_up_at timestamptz null;

create index if not exists leads_next_follow_up_at_idx on public.leads (next_follow_up_at);

alter table public.lead_activities drop constraint if exists lead_activities_activity_type_check;
alter table public.lead_activities add constraint lead_activities_activity_type_check
  check (
    activity_type in (
      'created', 'status_changed', 'assigned', 'unassigned', 'score_changed', 'note_updated',
      'follow_up_scheduled'
    )
  );
