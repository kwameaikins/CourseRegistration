-- Zoom attendance tracking (founder-approved 2026-07-19, "Option 2"):
-- registration-required Zoom meetings, per-participant join links created at
-- payment confirmation, and a post-class report sync into an attendance table.
--
-- Flow: Batch stores its Zoom meeting ID -> on payment_status = Paid the app
-- registers the Participant with Zoom (unique join_url, stored in
-- zoom_registrants) and emails it (email type 'zoom_link') -> a daily cron
-- pulls /report/meetings/{id}/participants and upserts attendance rows,
-- matching participants by the registered email.

begin;

-- The numeric Zoom meeting ID for this Batch (registration-required meeting).
-- zoom_link remains the human-readable fallback link.
alter table public.batches
    add column zoom_meeting_id text;

comment on column public.batches.zoom_meeting_id is
    'Numeric Zoom meeting ID with registration required. When set, paid participants are auto-registered for a personal join link and attendance is synced.';

-- One Zoom registrant per Registration — created when payment is confirmed.
create table public.zoom_registrants (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null references public.registrations(id) on delete cascade,
    zoom_registrant_id  text not null,
    join_url            text not null,
    created_at          timestamptz not null default now(),
    unique (registration_id)
);

comment on table public.zoom_registrants is
    'Per-Registration Zoom registrant: unique join link created at payment confirmation. The unique constraint makes re-registration idempotent.';

alter table public.zoom_registrants enable row level security;

create policy admin_read_zoom_registrants
on public.zoom_registrants for select
to authenticated
using (public.fn_current_role() = 'admin');

grant select, insert, update, delete on table public.zoom_registrants to authenticated;

-- One attendance row per Registration per session date, written by the
-- attendance sync cron. The unique pair makes cron re-runs idempotent.
create table public.attendance (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null references public.registrations(id) on delete cascade,
    session_date        date not null,
    join_time           timestamptz,
    leave_time          timestamptz,
    duration_minutes    integer not null default 0,
    created_at          timestamptz not null default now(),
    unique (registration_id, session_date)
);

comment on table public.attendance is
    'Per-session Zoom attendance synced from the Zoom participant report. unique(registration_id, session_date) makes the sync idempotent.';

create index idx_attendance_registration on public.attendance(registration_id);

alter table public.attendance enable row level security;

-- Admin and Management review attendance (same read posture as the dashboard).
create policy staff_read_attendance
on public.attendance for select
to authenticated
using (public.fn_current_role() in ('admin', 'management'));

grant select, insert, update, delete on table public.attendance to authenticated;

commit;
