-- Agentic voice calls via Vapi (founder-approved 2026-07-19, all six use
-- cases). Outbound call types and their triggers (dispatched by the daily
-- cron, scheduled into the 10:00 Ghana calling window):
--   payment_followup    — Unpaid 3+ days after registration
--   bank_transfer_chase — Part Payment with the start date <= 3 days away
--   no_show_recovery    — Paid but absent from yesterday's session
--   feedback_voice      — no feedback form response 3 days after end_date
--   upsell              — feedback course-interest matches an open batch
--   inbound             — calls TO the business line (catalog Q&A, send
--                         registration link, human-callback requests)
--
-- unique(registration_id, call_type) is the BR-07 analog: at most one call
-- per Registration per type, reserved BEFORE the Vapi call is created.
-- registration_id is null for inbound rows (NULLs don't collide).

begin;

create table public.call_log (
    id                      uuid primary key default gen_random_uuid(),
    registration_id         uuid references public.registrations(id) on delete cascade,
    call_type               text not null check (
                                call_type in (
                                    'payment_followup', 'bank_transfer_chase',
                                    'no_show_recovery', 'feedback_voice',
                                    'upsell', 'inbound'
                                )
                            ),
    vapi_call_id            text,
    phone                   text not null default '',
    status                  text not null default 'initiated' check (
                                status in ('initiated', 'scheduled', 'completed', 'failed')
                            ),
    summary                 text,
    transcript              text,
    needs_human_followup    boolean not null default false,
    promised_payment_date   date,
    bank_reference          text,
    created_at              timestamptz not null default now(),
    ended_at                timestamptz,
    unique (registration_id, call_type)
);

comment on table public.call_log is
    'Voice call audit trail (Vapi). unique(registration_id, call_type) enforces one call per Registration per type, reserved before dialing.';

create index idx_call_log_registration on public.call_log(registration_id);
create index idx_call_log_vapi on public.call_log(vapi_call_id);

alter table public.call_log enable row level security;

-- Admin, Finance (payment calls), and Management review calls; writes happen
-- only via the service-role client (cron dispatch + webhook).
create policy staff_read_call_log
on public.call_log for select
to authenticated
using (public.fn_current_role() in ('admin', 'finance', 'management'));

grant select, insert, update, delete on table public.call_log to authenticated;

commit;
