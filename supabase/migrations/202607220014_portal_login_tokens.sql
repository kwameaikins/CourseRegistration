-- One-time, single-use portal login tokens (founder-approved 2026-07-22):
-- minted only on the Paystack self-serve path when a payment transitions to
-- Paid, so the browser that just completed checkout can be logged straight
-- into the portal without a PIN step. Same trust posture as
-- participant_auth/participant_sessions (202607220013): no grant to
-- anon/authenticated at all, reachable only via the service-role client.
begin;

create table public.portal_login_tokens (
    id              uuid primary key default gen_random_uuid(),
    participant_id  uuid not null references public.participants(id) on delete cascade,
    registration_id uuid not null references public.registrations(id) on delete cascade,
    expires_at      timestamptz not null,
    consumed_at     timestamptz,
    created_at      timestamptz not null default now()
);

comment on table public.portal_login_tokens is
    'Short-lived (5 min), single-use tokens minted when a Paystack self-serve payment flips to Paid, exchanged by the browser for a real participant_sessions cookie. Never reachable by anon/authenticated.';

create index idx_portal_login_tokens_registration_id
    on public.portal_login_tokens(registration_id);
create index idx_portal_login_tokens_expires_at
    on public.portal_login_tokens(expires_at);

alter table public.portal_login_tokens enable row level security;
-- Zero policies — belt-and-suspenders on top of the missing grant, matching
-- participant_auth/participant_sessions exactly.

commit;
