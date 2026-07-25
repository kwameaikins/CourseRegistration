-- Live sending for campaigns (Phase 2 follow-up, explicitly approved
-- 2026-07-25). Per-channel switch: while a channel is OFF (the default),
-- "queue" stays dry-run only exactly as before. Only when a channel is
-- switched ON can staff trigger a real "Send" for a queued campaign on that
-- channel. Email dispatch uses Resend and SMS uses Arkesel; WhatsApp stays
-- disabled until its provider configuration and approved templates are ready.
create table if not exists public.campaign_send_settings (
  channel text primary key check (channel in ('email', 'whatsapp', 'sms')),
  live_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_users(id) on delete set null
);

insert into public.campaign_send_settings (channel, live_enabled)
values ('email', false), ('whatsapp', false), ('sms', false)
on conflict (channel) do nothing;

alter table public.campaign_send_settings enable row level security;

create policy staff_read_campaign_send_settings on public.campaign_send_settings
for select to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
      and su.role in ('admin', 'marketing', 'management')
  )
);

create policy admin_update_campaign_send_settings on public.campaign_send_settings
for update to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true and su.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true and su.role = 'admin'
  )
);

-- Per-recipient real-send outcome, separate from the dry-run preview_message
-- that's already recorded when a campaign is queued.
alter table public.campaign_members
  add column if not exists sent_at timestamptz,
  add column if not exists send_error text;

-- Allow the new 'sent' status: set once a live send has been triggered for
-- a queued campaign (per-recipient results live on campaign_members).
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns
  add constraint campaigns_status_check check (status in ('draft', 'queued', 'sent'));
