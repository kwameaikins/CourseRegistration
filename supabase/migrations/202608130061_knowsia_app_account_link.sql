-- Platform convergence, Seam I (2026-08-13): links a Participant in this
-- system to their user in KnowsiaApp (github.com/kwameaikins/KnowsiaApp), the
-- separate AI exam-prep platform. See Coding Docs/19_Platform_Convergence.md —
-- the boundary is "people and money here; learning content and AI there", so
-- this system stays the system of record for who a person is, and KnowsiaApp
-- holds its own back-link. Neither ever reads the other's database; the link is
-- established over HTTP with a short-lived single-use handoff token.
--
-- Same opaque single-use token pattern and trust posture as
-- participant_pin_reset_tokens (202607260033) and portal_login_tokens
-- (202607220014): the row's id IS the token, no grant to anon/authenticated at
-- all, reachable only via the service-role client.
begin;

create table public.knowsia_app_handoff_tokens (
    id             uuid primary key default gen_random_uuid(),
    participant_id uuid not null references public.participants(id) on delete cascade,
    expires_at     timestamptz not null,
    consumed_at    timestamptz,
    created_at     timestamptz not null default now()
);

comment on table public.knowsia_app_handoff_tokens is
    'Very short-lived (60 s), single-use tokens minted by portalService.issueKnowsiaAppHandoff for a live portal session and redeemed by KnowsiaApp over HTTP. Shorter TTL than participant_pin_reset_tokens because this is a machine redemption inside a browser redirect, not a human-read email link. Redeeming additionally requires KNOWSIA_APP_SERVICE_KEY, so an intercepted token alone yields nothing. Proves identity only — never entitlement (BR-45). Never reachable by anon/authenticated.';

create index idx_knowsia_app_handoff_tokens_participant_id
    on public.knowsia_app_handoff_tokens(participant_id);
create index idx_knowsia_app_handoff_tokens_expires_at
    on public.knowsia_app_handoff_tokens(expires_at);

alter table public.knowsia_app_handoff_tokens enable row level security;
-- Zero policies — belt-and-suspenders on top of the missing grant, matching
-- participant_pin_reset_tokens and portal_login_tokens exactly.

-- The link itself. Nullable: the overwhelming majority of Participants will
-- never have a KnowsiaApp account, and that is not an error state.
alter table public.participants
    add column knowsia_app_user_id   uuid,
    add column knowsia_app_linked_at timestamptz;

comment on column public.participants.knowsia_app_user_id is
    'The m1_users id of this Participant in KnowsiaApp, once linked. Written only by the service layer via the KNOWSIA_APP_SERVICE_KEY-authenticated link endpoint. Opaque here — this system never queries KnowsiaApp''s database with it.';

-- One KnowsiaApp user maps to at most one Participant. Partial, because NULL is
-- the normal state and must stay repeatable.
create unique index uq_participants_knowsia_app_user_id
    on public.participants(knowsia_app_user_id)
    where knowsia_app_user_id is not null;

-- Paired columns move together or not at all — same discipline as
-- lapsed_at/lapsed_by in 202608090059. A link with no timestamp (or a
-- timestamp with no link) is a bug, not a state worth representing.
alter table public.participants
    add constraint chk_participants_knowsia_app_link_paired
    check (
        (knowsia_app_user_id is null and knowsia_app_linked_at is null)
        or (knowsia_app_user_id is not null and knowsia_app_linked_at is not null)
    );

commit;
