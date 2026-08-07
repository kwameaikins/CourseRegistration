-- Attendance duration threshold support (founder-approved 2026-08-06:
-- "at least 40% meeting session rate").
--
-- Certificate eligibility on a free Batch tested `attendedSessions > 0`, which
-- is row EXISTENCE — so a two-minute appearance on a 175-minute session earned
-- the same credit as sitting through the whole thing. On the 2026-08-06 ESG
-- backfill that was 11 rows under 15 minutes, one of them 0 minutes.
--
-- Turning that into a percentage needs a denominator, and how long the session
-- itself ran is not derivable from the row: duration_minutes is the
-- PARTICIPANT's time, and batches carries a start_time but no end_time. So the
-- sync records the session length alongside each participant's presence.
--
-- Nullable on purpose: rows written before this migration have no denominator
-- and are treated as unthresholded rather than retroactively failed.

begin;

alter table public.attendance
    add column session_minutes integer
        check (session_minutes is null or session_minutes > 0);

comment on column public.attendance.session_minutes is
    'How long the Zoom session itself ran on session_date, in minutes — the longest single sitting of the meeting that day. Denominator for the attendance-rate rule: duration_minutes / session_minutes. Null on rows written before 2026-08-06, which are not thresholded.';

commit;
