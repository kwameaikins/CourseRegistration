-- NPS + email engagement tracking (Revenue OS Phase 2, 2026-09-03).
begin;

-- Standard 0–10 NPS question on course feedback. Nullable: older submissions
-- and the Vapi voice flow don't ask it (the Yes/Maybe/No recommendation
-- remains for continuity — NPS makes the answer benchmarkable).
alter table public.feedback
    add column if not exists nps_score integer
        check (nps_score is null or (nps_score >= 0 and nps_score <= 10));

-- Email engagement: Resend's webhook reports opened/clicked by its message
-- id, so the id is recorded at send time and the events land back on the
-- same email_log row that recorded the send.
alter table public.email_log add column if not exists provider_message_id text;
alter table public.email_log add column if not exists opened_at timestamptz;
alter table public.email_log add column if not exists clicked_at timestamptz;
create index if not exists idx_email_log_provider_message_id
    on public.email_log (provider_message_id) where provider_message_id is not null;

commit;
