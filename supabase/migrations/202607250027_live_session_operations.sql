-- LiveSession operational automation: independent reminder and attendance
-- records (Document 14, Section 4). Schema-only for now — no application
-- code reads or writes these yet; reminder orchestration and attendance
-- reconciliation are L3 (Reliability) roadmap items.
begin;

create table public.live_session_reminders (
    id                uuid primary key default gen_random_uuid(),
    live_session_id   uuid not null references public.live_sessions(id) on delete cascade,
    registration_id   uuid not null references public.registrations(id) on delete cascade,
    reminder_type     text not null check (reminder_type in ('24h', '2h')),
    channel           text not null check (channel in ('email', 'sms')),
    sent_at           timestamptz not null default now(),
    success           boolean not null,
    error_message     text,
    unique (live_session_id, registration_id, reminder_type, channel)
);

comment on table public.live_session_reminders is
    'Per-session reminder dispatch log — same reservation/dedup shape as email_log/sms_log, scoped to one LiveSession instead of the whole Registration.';

create table public.live_session_attendance (
    id                  uuid primary key default gen_random_uuid(),
    live_session_id     uuid not null references public.live_sessions(id) on delete cascade,
    registration_id     uuid not null references public.registrations(id) on delete cascade,
    join_time           timestamptz,
    leave_time          timestamptz,
    duration_minutes    integer not null default 0,
    source              text not null default 'zoom',
    reviewed_at         timestamptz,
    reviewed_by         uuid references public.staff_users(id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (live_session_id, registration_id)
);

comment on table public.live_session_attendance is
    'Session-level attendance, reconciled from the provider report and locked by a reviewer before it can feed completion/certificate eligibility (Document 14, Section 5, step 6).';

alter table public.live_session_reminders enable row level security;
alter table public.live_session_attendance enable row level security;

create policy admin_read_live_session_reminders
on public.live_session_reminders for select
to authenticated
using (public.fn_current_role() = 'admin');

create policy staff_read_live_session_attendance
on public.live_session_attendance for select
to authenticated
using (public.fn_current_role() in ('admin', 'management'));

commit;
