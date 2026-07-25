-- Live learning foundation. Existing batch-level Zoom meetings and attendance
-- remain unchanged while scheduled class occurrences move to LiveSession.
begin;

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  tutor_staff_id uuid references public.staff_users(id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 200),
  agenda text,
  learning_outcomes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Accra',
  provider text not null default 'zoom' check (provider in ('zoom')),
  zoom_meeting_id text,
  status text not null default 'scheduled' check (
    status in ('draft', 'scheduled', 'ready', 'live', 'completed', 'cancelled', 'rescheduled', 'archived')
  ),
  status_reason text,
  created_by uuid references public.staff_users(id) on delete set null,
  updated_by uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_sessions_end_after_start check (ends_at > starts_at)
);

comment on table public.live_sessions is
  'One planned or delivered class occurrence for a batch. Zoom linkage remains null until a pilot enables session-level provider creation.';

create index live_sessions_batch_starts_at_idx
  on public.live_sessions (batch_id, starts_at);
create index live_sessions_tutor_starts_at_idx
  on public.live_sessions (tutor_staff_id, starts_at);
create index live_sessions_status_starts_at_idx
  on public.live_sessions (status, starts_at);

create table public.live_session_audit_log (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'updated', 'status_changed')),
  actor_staff_id uuid references public.staff_users(id) on delete set null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index live_session_audit_log_session_created_at_idx
  on public.live_session_audit_log (live_session_id, created_at desc);

alter table public.live_sessions enable row level security;
alter table public.live_session_audit_log enable row level security;

create policy admin_full_live_sessions
on public.live_sessions for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy management_read_live_sessions
on public.live_sessions for select
to authenticated
using (public.fn_current_role() = 'management');

create policy tutor_read_assigned_live_sessions
on public.live_sessions for select
to authenticated
using (
  public.fn_current_role() = 'tutor'
  and (
    tutor_staff_id = public.fn_current_staff_id()
    or exists (
      select 1
      from public.batches
      where batches.id = live_sessions.batch_id
        and batches.facilitator_staff_id = public.fn_current_staff_id()
    )
  )
);

create policy admin_read_live_session_audit_log
on public.live_session_audit_log for select
to authenticated
using (public.fn_current_role() = 'admin');

create policy admin_insert_live_session_audit_log
on public.live_session_audit_log for insert
to authenticated
with check (public.fn_current_role() = 'admin');
create policy management_read_live_session_audit_log
on public.live_session_audit_log for select
to authenticated
using (public.fn_current_role() = 'management');

commit;