-- Self-service PIN reset for the student portal (2026-07-26): closes the
-- only portal gap where a participant who forgot their PIN, or got locked
-- out after 5 failed attempts, had no recovery path short of an admin
-- backfill. Same opaque single-use token pattern and trust posture as
-- portal_login_tokens (202607220014) and participant_auth/participant_sessions
-- (202607220013): the row's id IS the token, no grant to anon/authenticated
-- at all, reachable only via the service-role client.
begin;

create table public.participant_pin_reset_tokens (
    id             uuid primary key default gen_random_uuid(),
    participant_id uuid not null references public.participants(id) on delete cascade,
    expires_at     timestamptz not null,
    consumed_at    timestamptz,
    created_at     timestamptz not null default now()
);

comment on table public.participant_pin_reset_tokens is
    'Short-lived (15 min), single-use tokens minted by portalService.requestPinReset and emailed to the participant. Consuming one (resetPin) also clears any lockout on participant_auth. Never reachable by anon/authenticated.';

create index idx_participant_pin_reset_tokens_participant_id
    on public.participant_pin_reset_tokens(participant_id);
create index idx_participant_pin_reset_tokens_expires_at
    on public.participant_pin_reset_tokens(expires_at);

alter table public.participant_pin_reset_tokens enable row level security;
-- Zero policies — belt-and-suspenders on top of the missing grant, matching
-- portal_login_tokens exactly.

commit;
