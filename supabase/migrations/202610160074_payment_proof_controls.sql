-- Payment-proof controls (founder-requested 2026-10-16, after a deliberate test:
-- a GH₵ 2 Paystack MoMo payment's own SMS, re-submitted as a "MoMo transfer"
-- proof, was approved and the balance counted twice).
--
-- 1. reference_normalized — the reference as typed, upper-cased with every
--    non-alphanumeric removed. UNIQUE across every pending or approved proof
--    (any participant): one MoMo / bank transaction can be claimed once, ever.
--    A rejected proof frees its reference (a typo can be corrected).
-- 2. slip_sha256 — the uploaded slip's fingerprint; the same file twice is
--    refused (a re-scan defeats it; it is the cheap catch, not the real one).
-- 3. flags — what the system noticed at submission, e.g. a Paystack payment
--    of the same amount on the same registration within 3 days. Shown in the
--    alert email and the review queue; a flagged proof needs a written reason
--    to approve.
-- 4. statement_confirmed — the reviewer ticked "I found this on our MoMo /
--    bank statement". Required for every approval from now on.

alter table public.payment_submissions
    add column reference_normalized text,
    add column slip_sha256 text,
    add column flags jsonb not null default '[]'::jsonb,
    add column statement_confirmed boolean not null default false;

update public.payment_submissions
   set reference_normalized = nullif(regexp_replace(upper(coalesce(transaction_reference, '')), '[^A-Z0-9]', '', 'g'), '');

create unique index payment_submissions_reference_once_idx
    on public.payment_submissions (reference_normalized)
    where status in ('pending', 'approved') and reference_normalized is not null;

create index payment_submissions_slip_sha256_idx
    on public.payment_submissions (slip_sha256)
    where slip_sha256 is not null;

comment on column public.payment_submissions.reference_normalized is
    'Upper-cased, alphanumerics only. Unique among pending/approved proofs: a transaction can be claimed once.';
comment on column public.payment_submissions.flags is
    'What the system noticed at submission (e.g. paystack_match). A flagged proof needs a written reason to approve.';
comment on column public.payment_submissions.statement_confirmed is
    'The reviewer confirmed the money is on Knowsia''s own MoMo / bank statement. Required to approve.';
