-- Staff-granted discretionary discount / full fee waiver (founder-approved
-- 2026-07-22), layered on top of (never replacing) the existing per-Batch
-- early-bird discount already frozen into payments.course_fee at
-- registration time. Reducing course_fee directly (rather than adding a
-- separate "discounted_fee" column) is deliberate: course_fee is exactly the
-- column fn_derive_payment_status() already watches (`before insert or
-- update of amount_paid, course_fee`), and every existing reader
-- (registration list/360, portal dashboard, Payment Tracking UI) already
-- reads courseFee/balance/paymentStatus off this one row — so lowering
-- course_fee flows through every existing derived trigger and every
-- existing UI with zero changes to either trigger.
--
-- original_fee is intentionally nullable and set lazily, exactly once, by
-- the first discount ever granted for a given payment row — not at
-- registration time. A payment that has never had a discount simply has
-- original_fee = null, and course_fee IS the original fee by definition.
begin;

alter table public.payments
    add column original_fee        numeric(10,2),
    add column discount_amount     numeric(10,2) not null default 0
                                     check (discount_amount >= 0),
    add column discount_reason     text,
    add column discount_granted_by uuid references public.staff_users(id) on delete set null,
    add column discount_granted_at timestamptz;

-- Defense in depth: once original_fee is set, the invariant
-- course_fee = original_fee - discount_amount must always hold. Rows that
-- have never had a discount (original_fee still null) are unconstrained.
alter table public.payments
    add constraint payments_discount_consistency
    check (original_fee is null or course_fee = original_fee - discount_amount);

comment on column public.payments.original_fee is
    'Snapshot of course_fee immediately before the first staff-granted discount was applied. Null = no discount has ever been granted on this payment. Immutable once set.';
comment on column public.payments.discount_amount is
    'Cumulative discretionary discount granted by staff (GHS), on top of any early-bird batch discount already baked into course_fee at registration. A discount_amount that brings the balance to zero is a full fee waiver — same mechanism, enforced by an admin-only role check in the application, not a separate column/flag.';
comment on column public.payments.discount_reason is
    'Mandatory audit note for the most recent discount grant.';
comment on column public.payments.discount_granted_by is
    'Staff user who granted the most recent discount.';

commit;
