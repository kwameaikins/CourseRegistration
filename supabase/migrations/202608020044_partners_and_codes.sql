-- Knowsia Growth Partner Programme (founder-requested 2026-08-02, per
-- Coding Docs/knowsia_growth_partner_programme.md). One `codes` table
-- serves both jobs — coupon discount and partner attribution — rather than
-- two separate systems, since a code a partner hands out verbally/over
-- WhatsApp is both the discount mechanism and more robust attribution than
-- cookie/link tracking alone for a business that sells mostly outside a web
-- funnel (tracked links are still supported as a secondary attribution
-- path, per the doc's priority order: code > link > manual).
--
-- Commission pipeline (doc's own language): Tracked -> Pending -> Approved
-- -> Payable -> Paid. "Tracked" is a derived state (a code_redemptions row
-- exists with no commission row yet, i.e. registered but not yet paid) —
-- only 5 real stored states below. A commission is only ever created once
-- the registration's payment actually clears (hooked into
-- runPaidTransitionSideEffects), using the amount ACTUALLY paid, per the
-- doc: "calculated on the amount actually collected... not the advertised
-- course fee."
begin;

create table public.partners (
    id                        uuid primary key default gen_random_uuid(),
    category                  text not null
                                  check (category in ('ambassador', 'tutor', 'institutional', 'strategic')),
    full_name                 text not null,
    email                     text,
    phone                     text not null,
    company_name              text,
    -- category='tutor' only: links to the tutor's own existing account —
    -- a tutor partner authenticates via tutor_auth/tutor_sessions, never
    -- gets a partner_auth row of their own.
    tutor_id                  uuid references public.tutors(id) on delete set null,
    -- Manual override (e.g. a negotiated Strategic Partner rate). Null for
    -- ambassador/institutional, whose effective rate is computed from
    -- rolling paid-enrolment volume at commission-accrual time, not stored.
    commission_rate           numeric(6,2),
    payout_method             text check (payout_method in ('MTN MoMo', 'Bank Transfer')),
    payout_details            text,
    status                    text not null default 'pending'
                                  check (status in ('pending', 'active', 'suspended', 'rejected')),
    -- Public application fields (doc SS5) — populated by the public form,
    -- null for staff-created partners (tutor/strategic).
    social_links              text,
    professional_background   text,
    promotional_methods       text,
    estimated_audience_size   text,
    agreed_to_code_of_conduct boolean not null default false,
    reviewed_by               uuid references public.staff_users(id) on delete set null,
    reviewed_at               timestamptz,
    created_by                uuid references public.staff_users(id) on delete set null,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now()
);

comment on table public.partners is
    'Affiliate/referral partners across 4 categories. Ambassadors/institutional may self-apply (status starts pending); tutor/strategic are always staff-created.';
comment on column public.partners.created_by is
    'Null means self-applied via the public form.';

-- Mirrors company_admin_auth/company_admin_sessions exactly
-- (202607260032_corporate_registration.sql) — RLS enabled, zero policies,
-- reachable only via the service-role client. Only ever populated for
-- non-tutor categories.
create table public.partner_auth (
    partner_id      uuid primary key references public.partners(id) on delete cascade,
    pin_hash        text not null,
    must_change_pin boolean not null default true,
    failed_attempts integer not null default 0,
    locked_until    timestamptz,
    last_login_at   timestamptz,
    created_at      timestamptz not null default now()
);

create table public.partner_sessions (
    id         uuid primary key default gen_random_uuid(),
    partner_id uuid not null references public.partners(id) on delete cascade,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

-- Unifies coupon + partner attribution. partner_id null + discount set =
-- pure coupon. discount null + partner_id set = pure attribution (student
-- pays full price, partner still earns a commission). Both set = the
-- common case (a partner's discount code).
create table public.codes (
    id                   uuid primary key default gen_random_uuid(),
    code                 text not null unique,
    partner_id           uuid references public.partners(id) on delete set null,
    discount_type        text check (discount_type in ('percentage', 'fixed_amount')),
    discount_value       numeric(10,2),
    applies_to_course_id uuid references public.courses(id) on delete cascade,
    max_uses             integer,
    uses_count           integer not null default 0,
    one_per_participant  boolean not null default true,
    expires_at           timestamptz,
    is_active            boolean not null default true,
    created_by           uuid references public.staff_users(id) on delete set null,
    created_at           timestamptz not null default now(),
    constraint codes_must_do_something check (partner_id is not null or discount_type is not null),
    constraint codes_discount_fields_together check ((discount_type is null) = (discount_value is null))
);

comment on table public.codes is
    'A code redeemed at registration — discounts the fee, attributes the signup to a partner, or both.';

create table public.code_redemptions (
    id                          uuid primary key default gen_random_uuid(),
    code_id                     uuid not null references public.codes(id) on delete cascade,
    registration_id             uuid not null references public.registrations(id) on delete cascade,
    participant_id              uuid not null references public.participants(id) on delete cascade,
    discount_amount_applied     numeric(10,2) not null default 0,
    attribution_method          text not null check (attribution_method in ('code', 'link', 'manual')),
    -- True when the registrant was already a lead before this redemption, or
    -- when the registrant's own contact info matches the code's partner —
    -- per the doc, the discount still applies but no commission is ever
    -- created for either case (checked at payment-clears time in
    -- modules/partners/service.ts; set here as a permanent record of why).
    existing_lead_at_redemption boolean not null default false,
    self_referral_at_redemption boolean not null default false,
    created_at                  timestamptz not null default now(),
    unique (registration_id)
);

create index code_redemptions_code_participant_idx
    on public.code_redemptions (code_id, participant_id);

-- Lightweight click log for the partner dashboard's "clicks" metric (doc
-- SS7) — deliberately minimal for this phase (no IP/fraud fields yet).
create table public.partner_link_clicks (
    id         uuid primary key default gen_random_uuid(),
    code_id    uuid not null references public.codes(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index partner_link_clicks_code_idx on public.partner_link_clicks (code_id, created_at desc);

create table public.partner_commissions (
    id                 uuid primary key default gen_random_uuid(),
    partner_id         uuid not null references public.partners(id) on delete cascade,
    registration_id    uuid not null references public.registrations(id) on delete cascade,
    code_redemption_id uuid not null references public.code_redemptions(id) on delete cascade,
    commission_amount  numeric(10,2) not null,
    status             text not null default 'pending'
                           check (status in ('pending', 'approved', 'payable', 'paid', 'clawed_back')),
    -- GREATEST(payment cleared date + 14 days, the batch's start_date) —
    -- reconciles the doc's 14-day hold with the batch-start risk window.
    qualifies_at       date not null,
    approved_at        timestamptz,
    marked_payable_at  timestamptz,
    marked_payable_by  uuid references public.staff_users(id) on delete set null,
    payout_id          uuid,
    paid_at            timestamptz,
    clawback_reason    text,
    created_at         timestamptz not null default now(),
    unique (registration_id)
);

comment on column public.partner_commissions.qualifies_at is
    'GREATEST(payment_date + 14 days, batch.start_date). The daily cron flips pending -> approved once today >= this date.';

create index partner_commissions_status_idx on public.partner_commissions (status, qualifies_at);

create table public.partner_payouts (
    id           uuid primary key default gen_random_uuid(),
    partner_id   uuid not null references public.partners(id) on delete cascade,
    total_amount numeric(10,2) not null,
    method       text not null,
    reference    text,
    period_start date,
    period_end   date,
    paid_by      uuid references public.staff_users(id) on delete set null,
    paid_at      timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

alter table public.partner_commissions
    add constraint partner_commissions_payout_id_fkey
    foreign key (payout_id) references public.partner_payouts(id) on delete set null;

alter table public.partners enable row level security;
alter table public.codes enable row level security;
alter table public.code_redemptions enable row level security;
alter table public.partner_link_clicks enable row level security;
alter table public.partner_commissions enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_auth enable row level security;
alter table public.partner_sessions enable row level security;
-- partner_auth/partner_sessions: intentionally no policies at all
-- (service-role only), same posture as company_admin_auth/
-- company_admin_sessions and participant_auth/participant_sessions.
-- Public application inserts into `partners` also go through the
-- service-role client (no anon policy needed), same posture as every
-- other unauthenticated write path in this app.

-- Admin + marketing manage partners/codes/click logs (same roles as
-- leads/campaigns); finance + admin handle commissions/payouts (same
-- roles as payments).
create policy admin_marketing_full_partners on public.partners for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_codes on public.codes for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy staff_read_code_redemptions on public.code_redemptions for select to authenticated
  using (public.fn_current_role() in ('admin', 'marketing', 'finance'));

create policy staff_read_partner_link_clicks on public.partner_link_clicks for select to authenticated
  using (public.fn_current_role() in ('admin', 'marketing', 'finance'));

create policy finance_admin_full_commissions on public.partner_commissions for all to authenticated
  using (public.fn_current_role() in ('finance', 'admin'))
  with check (public.fn_current_role() in ('finance', 'admin'));

create policy finance_admin_full_payouts on public.partner_payouts for all to authenticated
  using (public.fn_current_role() in ('finance', 'admin'))
  with check (public.fn_current_role() in ('finance', 'admin'));

grant select, insert, update, delete on public.partners to authenticated;
grant select, insert, update, delete on public.codes to authenticated;
grant select, insert, update, delete on public.code_redemptions to authenticated;
grant select, insert, update, delete on public.partner_link_clicks to authenticated;
grant select, insert, update, delete on public.partner_commissions to authenticated;
grant select, insert, update, delete on public.partner_payouts to authenticated;

commit;
