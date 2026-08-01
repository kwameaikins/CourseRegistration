-- Tutor Portal Phase 4 (founder-approved 2026-07-31) — Attendance Exceptions.
--
-- Gives a tutor a way to flag a no-show or request a correction on their own batch's
-- attendance, without ever writing to the `attendance` table directly (BR-34: "no
-- tutor-facing write path"). A tutor-raised row here always starts 'pending'; only an
-- admin's review can approve it, and only that admin approval triggers the actual
-- correction on `attendance` (source = 'manual_correction', distinguishing it from the
-- nightly Zoom-sync cron's writes).

begin;

alter table public.attendance
    add column source text not null default 'zoom_sync'
        check (source in ('zoom_sync', 'manual_correction'));

comment on column public.attendance.source is
    'zoom_sync: written by the nightly attendance cron. manual_correction: written by staff approving a tutor-raised attendance_exceptions row.';

create table public.attendance_exceptions (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null references public.registrations(id) on delete cascade,
    batch_id            uuid not null references public.batches(id) on delete cascade,
    session_date        date not null,
    exception_type      text not null
        check (exception_type in ('no_show_flag', 'correction_request')),
    raised_by_tutor_id  uuid references public.tutors(id) on delete set null,
    requested_present   boolean,
    reason              text not null check (char_length(trim(reason)) > 0),
    status              text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected')),
    reviewed_by         uuid references public.staff_users(id) on delete set null,
    reviewed_at         timestamptz,
    review_note         text,
    created_at          timestamptz not null default now()
);

comment on table public.attendance_exceptions is
    'Tutor-raised no-show flags and attendance correction requests. Always starts pending; admin review is the only path that can change attendance data (BR-34).';

create index attendance_exceptions_status_created_at_idx
    on public.attendance_exceptions (status, created_at desc);
create index attendance_exceptions_batch_idx
    on public.attendance_exceptions (batch_id);

alter table public.attendance_exceptions enable row level security;

-- Staff review this table under their own Supabase Auth session — same role gate as
-- the /attendance screen (lib/auth/roles.ts: ['admin', 'management']).
create policy admin_full_attendance_exceptions
on public.attendance_exceptions for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy management_read_attendance_exceptions
on public.attendance_exceptions for select
to authenticated
using (public.fn_current_role() = 'management');

grant select, insert, update, delete on table public.attendance_exceptions to authenticated;

-- No tutor-facing RLS policy: the tutor-raise path runs through the service-role
-- client (tutors have no Supabase Auth session for RLS to key off — BR-31), gated by
-- modules/tutors' requireOwnBatch check before the insert ever happens.

commit;
