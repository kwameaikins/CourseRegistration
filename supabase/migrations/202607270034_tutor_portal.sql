-- Tutor Portal (founder-approved 2026-07-27): tutors are external parties,
-- not Knowsia staff. Retires the staff-role Tutor experience (a single
-- staff_users role, gated by staff RLS, landing on a bare /my-courses page
-- with no working Zoom join link and zero attendance/certificate
-- visibility) in favor of a third non-staff portal tier — identical
-- architecture to the participant portal (202607220013_participant_
-- portal_auth.sql) and company admin portal (202607260032_corporate_
-- registration.sql): PIN + session-cookie auth, RLS enabled with ZERO
-- policies, authorization enforced entirely in the service layer against a
-- service-role client. See Coding Docs/16_Tutor_Operations.md.
begin;

create table public.tutors (
    id          uuid primary key default gen_random_uuid(),
    full_name   text not null,
    email       text not null unique,
    phone       text not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table public.tutors is
    'An external facilitator who teaches Knowsia courses. Deliberately not a staff_users row — tutors are not Knowsia staff (founder-approved 2026-07-27).';

-- Tutor portal auth — mirrors company_admin_auth/company_admin_sessions
-- exactly: RLS enabled, ZERO policies, no anon/authenticated grants —
-- reachable only via the service-role client from modules/tutors/repository.ts.
create table public.tutor_auth (
    tutor_id        uuid primary key references public.tutors(id) on delete cascade,
    pin_hash        text not null,
    must_change_pin boolean not null default true,
    failed_attempts integer not null default 0,
    locked_until    timestamptz,
    last_login_at   timestamptz,
    created_at      timestamptz not null default now()
);

create table public.tutor_sessions (
    id          uuid primary key default gen_random_uuid(),
    tutor_id    uuid not null references public.tutors(id) on delete cascade,
    expires_at  timestamptz not null,
    revoked_at  timestamptz,
    created_at  timestamptz not null default now()
);

create index tutor_sessions_tutor_id_idx on public.tutor_sessions (tutor_id);

alter table public.tutors enable row level security;
alter table public.tutor_auth enable row level security;
alter table public.tutor_sessions enable row level security;

create policy staff_read_tutors
on public.tutors for select
to authenticated
using (public.fn_current_role() in ('admin', 'management'));

create policy staff_write_tutors
on public.tutors for all
to authenticated
using (public.fn_current_role() in ('admin', 'management'))
with check (public.fn_current_role() in ('admin', 'management'));

-- tutor_auth / tutor_sessions: intentionally no policies — same
-- service-role-only, RLS-as-defense-in-depth posture as the participant
-- and company admin portals' equivalent tables.

-- Additive scoping columns — NOT a retarget of the existing
-- facilitator_staff_id (batches) / tutor_staff_id (live_sessions) FKs,
-- which point at staff_users and are left in place but no longer written
-- to by new code (safer than retargeting an FK against unknown production
-- data; a future cleanup migration can drop them once confirmed empty).
-- facilitator_name (required free text, already the display source of
-- truth everywhere — certificates, student portal, etc.) is untouched.
alter table public.batches
  add column facilitator_tutor_id uuid references public.tutors(id) on delete set null;

alter table public.live_sessions
  add column tutor_id uuid references public.tutors(id) on delete set null;

create index batches_facilitator_tutor_id_idx on public.batches (facilitator_tutor_id);
create index live_sessions_tutor_id_idx on public.live_sessions (tutor_id);

-- Retire the staff Tutor role: drop its now-dead RLS policies first, then
-- collapse the two "non-tutor" read policies (which existed only to
-- exclude tutor from the general staff read policy) back into the plain
-- staff read policy.
drop policy if exists tutor_read_own_batches on public.batches;
drop policy if exists tutor_read_confirmed_participants on public.participants;
drop policy if exists tutor_read_confirmed_own_batch on public.registrations;
drop policy if exists tutor_read_assigned_live_sessions on public.live_sessions;

drop policy if exists read_batches_non_tutor on public.batches;
create policy read_batches
on public.batches for select
to authenticated
using (public.fn_current_role() in ('finance', 'marketing', 'management'));

drop policy if exists read_courses on public.courses;
create policy read_courses
on public.courses for select
to authenticated
using (public.fn_current_role() in ('finance', 'marketing', 'management'));

-- Drop 'tutor' from the staff_users.role CHECK constraint. Looked up by
-- introspection rather than a hardcoded constraint name, since the
-- original constraint was declared inline (unnamed) in the foundation
-- migration and Postgres' auto-generated name was never confirmed against
-- a live database. If any staff_users row still has role = 'tutor', adding
-- the new, stricter constraint fails loudly (Postgres validates existing
-- rows by default) rather than silently corrupting data — confirmed no
-- such row exists in any committed seed/migration, but production should
-- be checked before this migration runs.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.staff_users'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%';

  if v_constraint_name is not null then
    execute format('alter table public.staff_users drop constraint %I', v_constraint_name);
  end if;

  alter table public.staff_users add constraint staff_users_role_check
    check (role in ('admin', 'finance', 'marketing', 'management'));
end $$;

commit;
