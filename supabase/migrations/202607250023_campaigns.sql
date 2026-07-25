-- Campaign workspace (Revenue OS Phase 2 roadmap item): staff compose a
-- message targeted at a filtered slice of leads. IMPORTANT: this is a
-- dry-run/draft-only feature by explicit product decision — "queueing" a
-- campaign only computes the matching audience and logs a preview of what
-- would be sent to each lead (campaign_members.preview_message); it never
-- calls any real email/WhatsApp/SMS provider. Live sending is a separate,
-- explicitly-approved future change.
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  message_subject text,
  message_body text not null,
  filter_lead_source text,
  filter_status text,
  filter_min_score integer,
  status text not null default 'draft' check (status in ('draft', 'queued')),
  created_by uuid references public.staff_users(id) on delete set null,
  queued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per lead matched by a queued campaign, holding the rendered
-- dry-run preview of the message that WOULD have been sent to that lead.
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  preview_message text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;

-- Read: admin, marketing, management (same roles that can see the Sales
-- Pipeline / Leads screens). Write (create/queue): admin and marketing only.
create policy staff_read_campaigns on public.campaigns
for select to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
      and su.role in ('admin', 'marketing', 'management')
  )
);

create policy staff_write_campaigns on public.campaigns
for insert to authenticated
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
      and su.role in ('admin', 'marketing')
  )
);

create policy staff_update_campaigns on public.campaigns
for update to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
      and su.role in ('admin', 'marketing')
  )
)
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
      and su.role in ('admin', 'marketing')
  )
);

create policy staff_read_campaign_members on public.campaign_members
for select to authenticated
using (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
      and su.role in ('admin', 'marketing', 'management')
  )
);

create policy staff_write_campaign_members on public.campaign_members
for insert to authenticated
with check (
  exists (
    select 1 from public.staff_users su
    where su.user_id = auth.uid() and su.is_active = true
      and su.role in ('admin', 'marketing')
  )
);
