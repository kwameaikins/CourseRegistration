-- Corporate registration (founder-approved 2026-07-26): a company buys N seats
-- in a batch for its employees, pays by invoice/bank transfer, and gets its own
-- portal contact. See Coding Docs/15_Corporate_Operations.md.
begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 200),
  tin text,
  billing_contact_name text not null,
  billing_email text not null,
  billing_phone text not null,
  billing_address text,
  notes text,
  created_by uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.companies is
  'A corporate client that buys seats in one or more course batches for its employees.';

create table public.company_batch_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  seats_purchased integer not null check (seats_purchased > 0),
  price_per_seat numeric(10,2) not null check (price_per_seat >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  status_reason text,
  notes text,
  created_by uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_batch_allocations is
  'One seat purchase: a company buying N seats in one batch. seats_used is derived
   (count of registrations with this allocation id), never stored, to avoid drift.';

create index company_batch_allocations_company_id_idx
  on public.company_batch_allocations (company_id);
create index company_batch_allocations_batch_id_idx
  on public.company_batch_allocations (batch_id);

alter table public.registrations
  add column company_allocation_id uuid references public.company_batch_allocations(id) on delete set null;

create index registrations_company_allocation_id_idx
  on public.registrations (company_allocation_id)
  where company_allocation_id is not null;

-- BR-27: a participant cannot be registered twice under the same allocation.
-- (The existing unique(participant_id, batch_id) on registrations already
-- prevents the underlying duplicate-batch-registration case; this partial
-- unique index additionally guards the allocation-scoped read path even if
-- that constraint were ever relaxed.)
create unique index company_allocation_participant_unique
  on public.registrations (company_allocation_id, participant_id)
  where company_allocation_id is not null;

-- Company admin portal auth — mirrors participant_auth/participant_sessions
-- (202607220013_participant_portal_auth.sql) exactly: RLS enabled, ZERO
-- policies, no anon/authenticated grants — reachable only via the
-- service-role client from modules/corporate/repository.ts.
create table public.company_admin_auth (
  company_id uuid primary key references public.companies(id) on delete cascade,
  pin_hash text not null,
  must_change_pin boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.company_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index company_admin_sessions_company_id_idx
  on public.company_admin_sessions (company_id);

alter table public.companies enable row level security;
alter table public.company_batch_allocations enable row level security;
alter table public.company_admin_auth enable row level security;
alter table public.company_admin_sessions enable row level security;

create policy staff_read_companies
on public.companies for select
to authenticated
using (public.fn_current_role() in ('admin', 'finance', 'marketing', 'management'));

create policy staff_write_companies
on public.companies for all
to authenticated
using (public.fn_current_role() in ('admin', 'finance'))
with check (public.fn_current_role() in ('admin', 'finance'));

create policy staff_read_company_batch_allocations
on public.company_batch_allocations for select
to authenticated
using (public.fn_current_role() in ('admin', 'finance', 'marketing', 'management'));

create policy staff_write_company_batch_allocations
on public.company_batch_allocations for all
to authenticated
using (public.fn_current_role() in ('admin', 'finance'))
with check (public.fn_current_role() in ('admin', 'finance'));

-- company_admin_auth / company_admin_sessions: intentionally no policies —
-- same "service-role only, RLS as defense in depth" posture as the
-- participant portal's equivalent tables.

commit;
