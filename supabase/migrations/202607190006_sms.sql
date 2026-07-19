-- SMS messaging via the Arkesel SMS API (founder-approved 2026-07-19).
-- Key-moment messages only (welcome, payment reminders, payment
-- confirmation), mirroring the WhatsApp engine's idempotency design
-- (BR-07 analog). Unlike WhatsApp, SMS bodies are composed in application
-- code (modules/communications/sms-engine.ts) — Arkesel has no server-side
-- template approval step. Required env vars: ARKESEL_API_KEY,
-- ARKESEL_SENDER_ID (sender ID must be pre-registered with Arkesel).

begin;

-- Master per-batch SMS toggle, parallel to whatsapp_enabled (BR-10 analog).
alter table public.batches
    add column sms_enabled boolean not null default true;

comment on column public.batches.sms_enabled is
    'Master toggle for all automated SMS messages for this Batch.';

-- Immutable SMS audit trail; unique pair enforces send-once dedup
-- exactly like email_log and whatsapp_log (BR-07 analog).
create table public.sms_log (
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

comment on table public.sms_log is
    'Immutable SMS send audit trail. The unique pair enforces send-once deduplication under concurrent execution.';

create index idx_sms_log_registration
    on public.sms_log(registration_id, message_type);

alter table public.sms_log enable row level security;

-- Admin may review the log; writes happen only via the service-role client
-- from trusted server-side code (same posture as email_log/whatsapp_log).
create policy admin_read_sms_log
on public.sms_log for select
to authenticated
using (public.fn_current_role() = 'admin');

grant select, insert, update, delete on table public.sms_log to authenticated;

commit;
