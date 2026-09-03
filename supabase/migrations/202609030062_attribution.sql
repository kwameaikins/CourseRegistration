-- Campaign attribution (Revenue OS Phase 2, 2026-09-03).
--
-- Until now the only attribution was the self-declared "How did you hear
-- about us?" dropdown (lead_source). This adds machine-captured first-touch
-- attribution: UTM parameters, referrer and landing page, captured client-side
-- into a 30-day cookie on the visitor's FIRST arrival and stored verbatim on
-- the rows they later create. First-touch wins by design — the question being
-- answered is "which campaign brought this person", not "what did they click
-- last".
--
-- JSONB rather than columns: the shape is a closed contract owned by
-- lib/attribution.ts (utm_source, utm_medium, utm_campaign, utm_term,
-- utm_content, referrer, landing_page, first_seen_at), it is written once and
-- never queried field-by-field outside reporting, and a JSONB column on three
-- tables beats fifteen nullable columns nobody constrains.
begin;

alter table public.registrations add column if not exists attribution jsonb;
alter table public.leads add column if not exists attribution jsonb;
alter table public.waitlist_entries add column if not exists attribution jsonb;

comment on column public.registrations.attribution is
    'First-touch campaign attribution captured from the visitor''s cookie at registration. Shape owned by lib/attribution.ts.';
comment on column public.leads.attribution is
    'First-touch campaign attribution captured from the visitor''s cookie when the lead was created. Shape owned by lib/attribution.ts.';
comment on column public.waitlist_entries.attribution is
    'First-touch campaign attribution captured from the visitor''s cookie when they joined the waitlist. Shape owned by lib/attribution.ts.';

-- The dashboard groups by utm_source/utm_campaign over a date range; the
-- range filter on created/registered_at is already indexed, so a GIN index
-- here would be premature — revisit if campaign reporting outgrows it.

commit;
