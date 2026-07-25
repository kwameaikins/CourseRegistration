-- Lead assignment rules (Revenue OS Phase 2 roadmap item): route a new lead
-- to a specific staff member automatically based on its lead_source, so
-- marketing doesn't have to manually assign every incoming lead. One active
-- rule per lead_source (case-insensitive) — the most recently created rule
-- for a source wins if an old one is deactivated rather than deleted.
create table if not exists public.lead_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  lead_source text not null,
  assigned_to uuid not null references public.staff_users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one ACTIVE rule per lead source at a time — deactivate the old one
-- before creating a replacement rather than having two rules race.
create unique index if not exists lead_assignment_rules_active_source_idx
  on public.lead_assignment_rules (lower(lead_source))
  where is_active;

alter table public.lead_assignment_rules enable row level security;

create policy staff_read_lead_assignment_rules on public.lead_assignment_rules
for select to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);

create policy admin_write_lead_assignment_rules on public.lead_assignment_rules
for insert to authenticated
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true and su.role = 'admin'
  )
);

create policy admin_update_lead_assignment_rules on public.lead_assignment_rules
for update to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true and su.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true and su.role = 'admin'
  )
);

create policy admin_delete_lead_assignment_rules on public.lead_assignment_rules
for delete to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true and su.role = 'admin'
  )
);
