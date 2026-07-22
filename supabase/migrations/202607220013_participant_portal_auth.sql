-- Student self-service portal (founder-approved 2026-07-22): participants
-- log in with email/phone + a PIN, forced to change it on first login, then
-- view their own registrations/payments/attendance/certificates.
--
-- Deliberately NOT Supabase Auth — staff auth (auth.users + staff_users) is
-- structurally one real account per staff member with a role from a fixed
-- enum; participants have no account today and authenticate with a 4-digit
-- PIN, not a password. Every existing unauthenticated surface in this app
-- (register, verify, feedback) already bypasses RLS/Supabase Auth via the
-- service-role client with explicit application-level scoping instead — the
-- portal follows that same established pattern. Accordingly these two
-- tables get NO grant to anon/authenticated at all (not even the usual
-- blanket "authenticated" grant other tables get) — they are reachable
-- exclusively from trusted server code using the service-role client.
begin;

create table public.participant_auth (
    participant_id   uuid primary key references public.participants(id) on delete cascade,
    pin_hash         text not null,
    must_change_pin  boolean not null default true,
    failed_attempts  integer not null default 0,
    locked_until     timestamptz,
    last_login_at    timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.participant_auth is
    'One row per Participant with portal access. pin_hash is a scrypt hash, never the raw PIN. Reachable only via the service-role client.';
comment on column public.participant_auth.failed_attempts is
    'Consecutive failed login attempts since the last success or lockout; resets to 0 on success or when a lockout is applied.';
comment on column public.participant_auth.locked_until is
    'Set after 5 consecutive failed attempts (15-minute lockout); null when not locked.';

create table public.participant_sessions (
    id             uuid primary key default gen_random_uuid(),
    participant_id uuid not null references public.participants(id) on delete cascade,
    created_at     timestamptz not null default now(),
    expires_at     timestamptz not null,
    revoked_at     timestamptz
);

comment on table public.participant_sessions is
    'Portal session tokens — the httpOnly cookie stores only this row''s unguessable id (same "opaque UUID as bearer token" pattern as the public feedback link).';

create index idx_participant_sessions_participant_id
    on public.participant_sessions(participant_id);
create index idx_participant_sessions_expires_at
    on public.participant_sessions(expires_at);

-- RLS enabled with zero policies — belt-and-suspenders on top of the
-- missing grant: even a stray session-client query returns nothing.
alter table public.participant_auth enable row level security;
alter table public.participant_sessions enable row level security;

commit;
