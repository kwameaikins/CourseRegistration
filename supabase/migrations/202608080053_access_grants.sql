begin;

-- Time-boxed course access for people who have NOT settled their balance
-- (founder-approved 2026-08-08): part payers, and students admitted on
-- credit.
--
-- Until now access was derived from money alone. fn_derive_payment_status
-- sets 'Paid' only when amount_paid >= course_fee, fn_sync_registration_status
-- then confirms the Registration, and every downstream gate reads one of
-- those two flags. That left exactly two ways to let a part payer in, and
-- both of them LIE ABOUT THE LEDGER:
--   * applyDiscount    — writes off money you still intend to collect, and
--                        an admin-level waiver at that;
--   * a fabricated amount_paid — mints a receipt for money never received,
--                        accrues real partner commission on it
--                        (accrueCommissionOnPaymentSystem), and silences the
--                        reminder cron that should still be chasing them.
--
-- A grant is deliberately orthogonal to payments: it never touches
-- course_fee, amount_paid, payment_status or discount_amount. The balance
-- stays owed, the reminders keep going out, revenue reporting is unaffected,
-- and the certificate stays blocked (isCertificateEligible already requires
-- 'Paid' — see modules/certificates/service.ts).
--
-- Append-only. An extension is a NEW ROW, never an UPDATE of expires_on, so
-- "this student has been extended three times" is answerable later — the
-- question you always end up asking about a credit debt. Effective expiry is
-- max(expires_on) over the rows that have not been revoked.
create table public.registration_access_grants (
    id              uuid primary key default gen_random_uuid(),
    registration_id uuid not null references public.registrations(id) on delete cascade,
    reason          text not null
                        check (reason in ('part_payment', 'credit', 'goodwill')),
    expires_on      date not null,
    -- Mandatory. A grant is money at risk; an unexplained one is worse than
    -- none. The automatic part-payment path fills this in itself.
    note            text not null check (length(trim(note)) > 0),
    -- Null = granted by the system, i.e. the automatic part-payment threshold
    -- in modules/payments/service.ts. Same convention as
    -- coupon_redemptions.applied_by_staff_id.
    granted_by      uuid references public.staff_users(id) on delete set null,
    granted_at      timestamptz not null default now(),
    revoked_by      uuid references public.staff_users(id) on delete set null,
    revoked_at      timestamptz,
    created_at      timestamptz not null default now()
);

comment on table public.registration_access_grants is
    'Time-boxed course access for an unsettled balance (part payment or credit). Append-only: an extension is a new row. Never affects the payments ledger — the balance stays owed and reminders keep sending.';
comment on column public.registration_access_grants.expires_on is
    'Inclusive last day of access. Access is a read-time comparison against current_date, so a failed expiry cron can never leave someone with access they should not have.';
comment on column public.registration_access_grants.granted_by is
    'Null for the automatic part-payment grant, which has no staff actor.';

create index registration_access_grants_active_idx
    on public.registration_access_grants (registration_id, expires_on desc)
    where revoked_at is null;

alter table public.registration_access_grants enable row level security;

-- Finance and admin own this surface: finance grants and extends within the
-- ceiling enforced in the service layer, admin without limit. Marketing and
-- tutors have no business here (a tutor's roster deliberately never reads
-- payment-adjacent tables — see selectRosterForBatchSystem).
create policy admin_finance_full_access_grants on public.registration_access_grants
  for all to authenticated
  using (public.fn_current_role() in ('admin', 'finance'))
  with check (public.fn_current_role() in ('admin', 'finance'));

grant select, insert, update, delete on public.registration_access_grants to authenticated;

-- Three new message types. Same widen-the-CHECK pattern as
-- 202608030048_free_events.sql.
--
--   access_granted  — transactional, like payment_confirmation: "you're in,
--                     here are the joining details, your access runs to X and
--                     you still owe Y."
--   access_expiring — the T-3 warning.
--   access_expired  — sent by the sweep that actually withdraws access.
--
-- Note these are once-per-registration by BR-07's unique(registration_id,
-- email_type) on email_log, so a student extended twice is warned only about
-- the first expiry. Same known limitation as installment_reminder, and
-- accepted for the same reason: the alternative is a second dedup dimension
-- on email_log that no other message type needs.
alter table public.email_templates
    drop constraint email_templates_email_type_check;

alter table public.email_templates
    add constraint email_templates_email_type_check
    check (
        email_type in (
            'welcome', 'payment_instruction', 'reminder_1', 'reminder_2',
            'reminder_3', 'reminder_4', 'payment_confirmation',
            'class_reminder_24h', 'class_reminder_2h', 'zoom_link',
            'whatsapp_invite', 'post_training_thankyou', 'upsell',
            'installment_reminder', 'free_welcome',
            'access_granted', 'access_expiring', 'access_expired'
        )
    );

-- sms_log/whatsapp_log CHECKs are deliberately left alone, same call as
-- 202608030048: access grants notify by email only for now. Nothing in the
-- WhatsApp path has an approved Meta template for this, and inventing one
-- here would fail at send time rather than at migration time.

commit;
