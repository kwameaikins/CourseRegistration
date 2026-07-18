-- WhatsApp messaging via the Meta WhatsApp Business Cloud API.
-- Founder-approved scope addition (2026-07-18): key-moment messages only
-- (welcome + payment instructions, payment reminders, payment confirmation),
-- mirroring the email engine's idempotency design (BR-07 analog).
--
-- NOTE: message bodies live in Meta Business Manager as pre-approved
-- templates, not in this database. The application sends template names +
-- parameters. Required templates (create in Meta Business Manager, language
-- 'en', body parameters {{1}}, {{2}}, ...):
--   course_registration_welcome   {{1}}=participant name, {{2}}=course+cohort,
--                                 {{3}}=start date, {{4}}=course fee GHS,
--                                 {{5}}=Professional Learning Network group
--                                 invite link (COMMUNITY_WHATSAPP_LINK env),
--                                 {{6}}=WhatsApp channel invite link
--                                 (COMMUNITY_WHATSAPP_CHANNEL_LINK env) —
--                                 both business-wide, not per-Batch, sent
--                                 immediately at registration regardless of
--                                 payment status.
--   course_payment_reminder       {{1}}=participant name, {{2}}=course+cohort,
--                                 {{3}}=outstanding balance GHS, {{4}}=start date
--   course_payment_confirmation   {{1}}=participant name, {{2}}=course+cohort,
--                                 {{3}}=amount paid GHS, {{4}}=this Batch's
--                                 course-specific WhatsApp group invite link
--                                 (Batch.whatsappGroupLink) — sent only once
--                                 payment is confirmed, per Batch/cohort.

begin;

-- Master per-batch WhatsApp toggle, parallel to the email toggles (BR-10 analog).
alter table public.batches
    add column whatsapp_enabled boolean not null default true;

comment on column public.batches.whatsapp_enabled is
    'Master toggle for all automated WhatsApp messages for this Batch.';

-- Immutable WhatsApp audit trail; unique pair enforces send-once dedup
-- exactly like email_log (BR-07 analog).
create table public.whatsapp_log (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null references public.registrations(id) on delete cascade,
    message_type        text not null check (
                            message_type in (
                                'welcome', 'reminder_1', 'reminder_2',
                                'reminder_3', 'reminder_4', 'payment_confirmation'
                            )
                        ),
    sent_at             timestamptz not null default now(),
    success             boolean not null,
    error_message       text,
    unique (registration_id, message_type)
);

comment on table public.whatsapp_log is
    'Immutable WhatsApp send audit trail. The unique pair enforces send-once deduplication under concurrent execution.';

create index idx_whatsapp_log_registration
    on public.whatsapp_log(registration_id, message_type);

alter table public.whatsapp_log enable row level security;

-- Admin may review the log; writes happen only via the service-role client
-- from trusted server-side code (same posture as email_log).
create policy admin_read_whatsapp_log
on public.whatsapp_log for select
to authenticated
using (public.fn_current_role() = 'admin');

grant select, insert, update, delete on table public.whatsapp_log to authenticated;

commit;
