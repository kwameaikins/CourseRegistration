-- Lead activity/audit log (Revenue OS Phase 1 roadmap item). Records a
-- timeline entry every time a lead is created or one of its key fields
-- changes (status, assignment, score, notes), instead of silently
-- overwriting history the way the leads table itself does.
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_type text not null check (
    activity_type in (
      'created', 'status_changed', 'assigned', 'unassigned', 'score_changed', 'note_updated'
    )
  ),
  description text not null,
  performed_by uuid null references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_id_idx
  on public.lead_activities (lead_id, created_at desc);

alter table public.lead_activities enable row level security;

create policy staff_read_lead_activities on public.lead_activities
for select to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);

create policy staff_insert_lead_activities on public.lead_activities
for insert to authenticated
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);
