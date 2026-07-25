-- Per-session learner access. A personal Zoom registrant URL belongs to one
-- confirmed registration and one LiveSession; it is never exposed by RLS.
begin;

create table public.live_session_registrants (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  zoom_registrant_id text not null,
  join_url text not null,
  created_at timestamptz not null default now(),
  unique (live_session_id, registration_id)
);

create index live_session_registrants_registration_idx
  on public.live_session_registrants (registration_id);

alter table public.live_session_registrants enable row level security;

create policy admin_read_live_session_registrants
on public.live_session_registrants for select
to authenticated
using (public.fn_current_role() = 'admin');

commit;