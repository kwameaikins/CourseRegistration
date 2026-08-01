-- Registration-audience campaigns (Admin Assistant tools, 2026-08-01):
-- campaigns/campaign_members were structurally lead-only (campaign_members.
-- lead_id was not null). This adds a second audience type so a campaign can
-- target a filtered slice of registrations (e.g. all unpaid in a batch)
-- instead of leads. A campaign targets exactly one audience type; the
-- filter_* columns are only meaningful when audience_type = 'registrations'.
begin;

alter table public.campaigns
  add column audience_type text not null default 'leads'
    check (audience_type in ('leads', 'registrations')),
  add column filter_batch_id uuid references public.batches(id) on delete set null,
  add column filter_course_id uuid references public.courses(id) on delete set null,
  add column filter_payment_status text,
  add column filter_registration_status text;

-- lead_id stays the target for audience_type = 'leads'; registration_id is
-- the target for audience_type = 'registrations'. Exactly one of the two
-- must be set on any member row.
alter table public.campaign_members
  alter column lead_id drop not null,
  add column registration_id uuid references public.registrations(id) on delete cascade,
  add constraint campaign_members_exactly_one_target
    check (num_nonnulls(lead_id, registration_id) = 1);

-- Existing unique(campaign_id, lead_id) is untouched — Postgres treats NULL
-- as distinct, so registration-audience rows (lead_id null) never collide
-- with it. This is the equivalent guard for the registration_id side.
create unique index campaign_members_campaign_registration_unique
  on public.campaign_members(campaign_id, registration_id)
  where registration_id is not null;

commit;
