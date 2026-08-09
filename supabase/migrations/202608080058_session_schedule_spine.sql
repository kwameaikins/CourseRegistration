begin;

-- Live sessions become the spine, instead of a parallel world (founder
-- direction 2026-08-08 after reviewing actual usage).
--
-- What the data showed. Five tables were built for this subsystem and four
-- of them had never received a single row:
--
--   live_sessions            4 rows, across 1 of 6 batches
--   live_session_attendance  0
--   live_session_registrants 0
--   live_session_reminders   0
--   session_materials        0
--   assignments              0
--
-- Meanwhile the attendance that actually exists — 142 rows from the Zoom
-- sync — lives in public.attendance keyed by session_date, with no link to
-- live_sessions at all. So there were two attendance models, and the one
-- designed for this feature was the dead one.
--
-- The reason it stayed empty is mechanical, not cultural: sessions could
-- only be created ONE AT A TIME by hand (createLiveSession). Nobody
-- hand-enters twelve sessions per cohort, so nobody did. The visible cost
-- was that the student portal's "Next Class" card reads live_sessions, so
-- five of six cohorts never saw it.
--
-- This migration does three things:
--   1. gives attendance a real foreign key to the session it belongs to;
--   2. makes (batch_id, starts_at) unique so schedule generation can be
--      idempotent — re-running it must never duplicate a session;
--   3. drops the two zero-row tables rather than leaving parallel structures
--      for the next person to wonder about.

-- 1. Attendance belongs to a session.
--
-- Nullable, and session_date is deliberately KEPT. Attendance is written by
-- the Zoom sync from meeting reports, which know a date and a meeting id but
-- nothing about our session rows; the sync resolves the session where it can
-- and still records the observation where it cannot. A null here means "we
-- saw this person attend on this date but could not tie it to a scheduled
-- session" — a real state worth being able to see, not an error.
alter table public.attendance
    add column live_session_id uuid references public.live_sessions(id) on delete set null;

comment on column public.attendance.live_session_id is
    'The scheduled session this attendance belongs to, resolved by the Zoom sync from batch + date. Null when no session matched — the observation is still recorded against session_date.';

create index attendance_live_session_idx
    on public.attendance (live_session_id)
    where live_session_id is not null;

-- 2. One session per batch per start time.
--
-- This is what lets generateSessionsForBatch be safely re-runnable: editing a
-- batch's schedule regenerates, and the constraint absorbs the overlap rather
-- than producing duplicates.
alter table public.live_sessions
    add constraint live_sessions_batch_start_unique unique (batch_id, starts_at);

-- 3. Retire the parallel attendance model.
--
-- Both are zero-row, verified immediately before writing this migration, so
-- there is nothing to migrate and no data decision to make. public.attendance
-- is the single attendance model from here.
drop table if exists public.live_session_attendance;
drop table if exists public.live_session_registrants;

-- live_session_reminders is also empty but is NOT dropped: per-session
-- reminders are a Phase 2 feature on the same spine, and the table is the
-- right shape for it. Dropping and recreating it would be churn.

-- Backfill: tie existing attendance to the sessions that already exist.
-- Only 4 sessions exist across 1 batch, so this touches very little — but it
-- proves the join works before the sync starts relying on it.
update public.attendance a
   set live_session_id = ls.id
  from public.live_sessions ls
  join public.registrations r on r.batch_id = ls.batch_id
 where a.registration_id = r.id
   and a.live_session_id is null
   and (ls.starts_at at time zone 'Africa/Accra')::date = a.session_date;

do $$
declare
    linked integer;
    total  integer;
begin
    select count(*) filter (where live_session_id is not null), count(*)
      into linked, total
      from public.attendance;
    raise notice
        'session spine: % of % attendance rows linked to a scheduled session. The remainder predate session generation and stay keyed on session_date alone.',
        linked, total;
end;
$$;

commit;
