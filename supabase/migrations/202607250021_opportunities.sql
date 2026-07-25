-- Sales pipeline / opportunities (Revenue OS Phase 1 roadmap item). One
-- opportunity per registration, created alongside the lead so staff have a
-- deal-centric view (stage, value, expected close) distinct from the lead's
-- contact-centric view. Course/batch labels are denormalized (same posture
-- as leads.full_name/email) so the pipeline list needs no joins.
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.leads(id) on delete set null,
  registration_id uuid null references public.registrations(id) on delete set null,
  course_name text not null,
  batch_label text not null,
  amount numeric(10, 2) not null default 0,
  stage text not null default 'New' check (
    stage in ('New', 'Contacted', 'Proposal', 'Won', 'Lost')
  ),
  expected_close_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_stage_idx on public.opportunities (stage);
create index if not exists opportunities_registration_id_idx on public.opportunities (registration_id);
create index if not exists opportunities_created_at_idx on public.opportunities (created_at desc);

alter table public.opportunities enable row level security;

create policy staff_read_opportunities on public.opportunities
for select to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);

create policy staff_insert_opportunities on public.opportunities
for insert to authenticated
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);

create policy staff_update_opportunities on public.opportunities
for update to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
)
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);
