-- Batch capacity + waitlist + fixed payment installments
-- (founder-approved 2026-07-24). These are additive: existing registrations
-- and the single aggregate payments row remain the source of truth.

begin;

alter table public.batches
    add column capacity integer check (capacity is null or capacity > 0);

comment on column public.batches.capacity is
    'Maximum active registrations allowed for the batch. Null means unlimited. Once active registrations reach this number, new public submissions become waitlist entries instead of registrations.';

create table public.waitlist_entries (
    id                         uuid primary key default gen_random_uuid(),
    participant_id             uuid not null references public.participants(id) on delete cascade,
    batch_id                   uuid not null references public.batches(id) on delete cascade,
    status                     text not null default 'Waiting'
                                  check (status in ('Waiting', 'Offered', 'Converted', 'Cancelled')),
    lead_source                text not null check (
                                  lead_source in (
                                      'WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other'
                                  )
                              ),
    consent_given              boolean not null default true,
    offered_at                 timestamptz,
    converted_registration_id  uuid references public.registrations(id) on delete set null,
    notes                      text,
    created_at                 timestamptz not null default now(),
    updated_at                 timestamptz not null default now(),
    unique (participant_id, batch_id)
);

comment on table public.waitlist_entries is
    'Participants who attempted to register after a capacity-limited batch was full. One waitlist entry per participant per batch.';

create table public.payment_installments (
    id                  uuid primary key default gen_random_uuid(),
    payment_id          uuid not null references public.payments(id) on delete cascade,
    registration_id     uuid not null references public.registrations(id) on delete cascade,
    installment_number  integer not null check (installment_number > 0),
    amount_due          numeric(10,2) not null check (amount_due >= 0),
    amount_paid         numeric(10,2) not null default 0 check (amount_paid >= 0),
    due_date            date not null,
    payment_status      text not null default 'Pending'
                            check (payment_status in ('Pending', 'Paid')),
    transaction_id      text unique,
    paid_at             timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (payment_id, installment_number),
    unique (registration_id, installment_number)
);

comment on table public.payment_installments is
    'Simple fixed-split payment schedule for a registration. The parent payments.amount_paid remains the aggregate amount used by BR-04/BR-05/BR-06.';
comment on column public.payment_installments.transaction_id is
    'Paystack reference for this installment. Uniqueness is the installment-level BR-14 idempotency key.';

create index idx_waitlist_entries_batch_status
    on public.waitlist_entries (batch_id, status, created_at);
create index idx_payment_installments_registration
    on public.payment_installments (registration_id, installment_number);
create index idx_payment_installments_due
    on public.payment_installments (due_date, payment_status);

create or replace function public.fn_derive_installment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.amount_paid >= new.amount_due then
        new.payment_status := 'Paid';
        if new.paid_at is null then
            new.paid_at := now();
        end if;
    else
        new.payment_status := 'Pending';
        new.paid_at := null;
    end if;
    new.updated_at := now();
    return new;
end;
$$;

create trigger trg_derive_installment_status
before insert or update of amount_paid, amount_due
on public.payment_installments
for each row execute function public.fn_derive_installment_status();

alter table public.waitlist_entries enable row level security;
alter table public.payment_installments enable row level security;

create policy admin_full_waitlist_entries
on public.waitlist_entries for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy staff_read_waitlist_entries
on public.waitlist_entries for select
to authenticated
using (public.fn_current_role() in ('finance', 'marketing', 'management'));

create policy admin_full_payment_installments
on public.payment_installments for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy finance_full_payment_installments
on public.payment_installments for all
to authenticated
using (public.fn_current_role() = 'finance')
with check (public.fn_current_role() = 'finance');

create policy marketing_read_installment_status
on public.payment_installments for select
to authenticated
using (public.fn_current_role() = 'marketing');

commit;
