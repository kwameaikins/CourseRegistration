begin;

-- Standalone coupon codes (founder-approved 2026-08-07).
--
-- Deliberately SEPARATE from public.codes. That table exists to attribute a
-- signup to a partner and drive the commission pipeline
-- (code_redemptions -> partner_commissions); a marketing coupon has no
-- partner and must never touch commission. Keeping them apart also means the
-- two `unique (registration_id)` constraints are independent, so a student
-- who arrived through a partner's referral link can still use a coupon —
-- impossible if both shared public.code_redemptions.
--
-- Unlike a partner code, a coupon can be applied at ANY point before the
-- balance is settled: on the registration form, by the student from their
-- portal, or by finance from the Payments screen.
create table public.coupons (
    id                   uuid primary key default gen_random_uuid(),
    code                 text not null unique,
    description          text,
    discount_type        text not null check (discount_type in ('percentage', 'fixed_amount')),
    discount_value       numeric(10,2) not null check (discount_value > 0),
    -- Null = valid on every course.
    applies_to_course_id uuid references public.courses(id) on delete cascade,
    -- Null = unlimited redemptions.
    max_uses             integer check (max_uses is null or max_uses > 0),
    uses_count           integer not null default 0,
    one_per_participant  boolean not null default true,
    starts_at            timestamptz,
    expires_at           timestamptz,
    is_active            boolean not null default true,
    created_by           uuid references public.staff_users(id) on delete set null,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    -- public.codes has no equivalent guard, so a percentage code above 100
    -- there would drive course_fee negative (the fixed_amount branch is
    -- floored with Math.max(0, ...) in the application, the percentage branch
    -- is not). Not inheriting that here.
    constraint coupons_percentage_within_range
        check (discount_type <> 'percentage' or discount_value <= 100),
    constraint coupons_window_ordered
        check (starts_at is null or expires_at is null or starts_at < expires_at)
);

comment on table public.coupons is
    'Standalone marketing discount codes. No partner attribution and no commission — see public.codes for the affiliate programme.';
comment on column public.coupons.uses_count is
    'Incremented only when a redemption actually reduced a fee. A coupon that lost the best-price-wins comparison at registration is never consumed.';

create table public.coupon_redemptions (
    id                      uuid primary key default gen_random_uuid(),
    coupon_id               uuid not null references public.coupons(id) on delete cascade,
    registration_id         uuid not null references public.registrations(id) on delete cascade,
    participant_id          uuid not null references public.participants(id) on delete cascade,
    discount_amount_applied numeric(10,2) not null default 0,
    applied_at_stage        text not null
                                check (applied_at_stage in ('registration', 'post_registration')),
    -- Null = the participant applied it themselves from the portal.
    applied_by_staff_id     uuid references public.staff_users(id) on delete set null,
    created_at              timestamptz not null default now(),
    unique (registration_id)
);

comment on table public.coupon_redemptions is
    'One coupon per registration, at most. Independent of code_redemptions, so a registration may carry both a partner referral and a coupon.';

create index coupon_redemptions_coupon_participant_idx
    on public.coupon_redemptions (coupon_id, participant_id);

-- Brute-force throttle for the participant-facing apply endpoint. A coupon
-- code is a short guessable string and this app has no general rate limiter —
-- only the PIN lockouts on the four portal logins. Mirrors that shape:
-- 10 failures in 15 minutes locks further attempts.
create table public.coupon_attempt_log (
    id             uuid primary key default gen_random_uuid(),
    participant_id uuid not null references public.participants(id) on delete cascade,
    attempted_at   timestamptz not null default now()
);

create index coupon_attempt_log_participant_time_idx
    on public.coupon_attempt_log (participant_id, attempted_at desc);

comment on table public.coupon_attempt_log is
    'Failed coupon-code attempts per participant. Only failures are logged; rows are never cleared on success.';

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.coupon_attempt_log enable row level security;
-- coupon_attempt_log: intentionally no policies at all (service-role only),
-- same posture as participant_auth/participant_sessions.

-- Admin + marketing own the coupon catalogue (same roles as codes/campaigns);
-- finance reads it so they can apply one from the Payments screen.
create policy admin_marketing_full_coupons on public.coupons for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy finance_read_coupons on public.coupons for select to authenticated
  using (public.fn_current_role() = 'finance');

create policy staff_read_coupon_redemptions on public.coupon_redemptions for select to authenticated
  using (public.fn_current_role() in ('admin', 'marketing', 'finance'));

grant select, insert, update, delete on public.coupons to authenticated;
grant select, insert, update, delete on public.coupon_redemptions to authenticated;

commit;
