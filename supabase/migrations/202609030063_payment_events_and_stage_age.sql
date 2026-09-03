-- Payment events ledger + opportunity stage age (Revenue OS Phase 2, 2026-09-03).
--
-- payments is one aggregate row per registration, so "revenue received this
-- month" could only be approximated by the registration's CREATED date — a
-- payment collected in September against an August registration vanished from
-- September's number (the dashboard admits this as a Phase 2 caveat). This
-- ledger records each payment DELTA as it is applied, giving the dashboard a
-- payment-dated revenue figure. It is an analytics ledger, not a second
-- source of financial truth: payments.amount_paid remains authoritative, and
-- BR-04/05/06 derivations are untouched.
begin;

create table public.payment_events (
    id              uuid primary key default gen_random_uuid(),
    registration_id uuid not null references public.registrations(id) on delete cascade,
    -- The delta applied in this event. Negative when staff correct an
    -- over-recorded amount downward — the ledger must sum to the aggregate.
    amount          numeric(10,2) not null,
    payment_method  text,
    transaction_id  text,
    source          text not null default 'staff'
                      check (source in ('staff','paystack','import','corporate','submission','system')),
    recorded_by     uuid references public.staff_users(id) on delete set null,
    recorded_at     timestamptz not null default now()
);

create index idx_payment_events_recorded_at on public.payment_events (recorded_at);
create index idx_payment_events_registration on public.payment_events (registration_id);

comment on table public.payment_events is
    'Analytics ledger of payment deltas, written by applyPaymentUpdate. payments.amount_paid stays authoritative.';

alter table public.payment_events enable row level security;

-- Staff read; writes go through the service-role client only (same posture
-- as the message logs).
create policy staff_read_payment_events
on public.payment_events for select
to authenticated
using (public.fn_current_role() in ('admin','finance','management'));

-- Opportunity stage age: without a stamp for the LAST stage change, "how long
-- has this deal sat in Proposal" was unanswerable.
alter table public.opportunities
    add column if not exists stage_changed_at timestamptz not null default now();

comment on column public.opportunities.stage_changed_at is
    'When the stage last changed; set alongside every stage update so age-in-stage is reportable.';

commit;
