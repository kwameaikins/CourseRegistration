-- Deadline-based early-registration discount, per Batch (founder-approved
-- 2026-07-18). Anyone who registers on or before discount_cutoff_date pays
-- discounted_fee instead of course_fee; the effective fee is decided and
-- copied onto the Payment at registration time (BR-18 extension), so it
-- never changes retroactively for an already-registered participant.
begin;

alter table public.batches
    add column discount_cutoff_date date,
    add column discounted_fee      numeric(10, 2)
        check (discounted_fee is null or discounted_fee >= 0);

alter table public.batches
    add constraint discount_fields_set_together
        check ((discount_cutoff_date is null) = (discounted_fee is null)),
    add constraint discounted_fee_below_course_fee
        check (discounted_fee is null or discounted_fee <= course_fee);

comment on column public.batches.discount_cutoff_date is
    'Last date (inclusive) a registrant pays discounted_fee instead of course_fee. Null means no early-registration discount for this Batch.';
comment on column public.batches.discounted_fee is
    'Early-registration fee, charged instead of course_fee for registrations on or before discount_cutoff_date. Always set together with discount_cutoff_date.';

commit;
