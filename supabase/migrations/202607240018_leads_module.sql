create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid null references public.registrations(id) on delete set null,
  participant_id uuid null references public.participants(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null,
  job_title text null,
  company text null,
  lead_source text not null default 'Website',
  status text not null default 'New',
  score integer not null default 0,
  assigned_to uuid null references public.staff_users(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_email_idx on public.leads (email);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

create policy staff_read_leads on public.leads
for select to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);

create policy staff_insert_leads on public.leads
for insert to authenticated
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
  )
);

create policy staff_update_leads on public.leads
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
