begin;

-- When a cohort actually meets (founder-approved 2026-08-08).
--
-- Two columns the schema has never had, both needed for the same reason: a
-- Zoom classroom that is open ONLY around class time.
--
-- Today every classroom is one meeting per Course, created as Zoom type 3 —
-- recurring, NO FIXED TIME (createZoomMeeting in lib/zoom/client.ts). A type
-- 3 meeting has no start_time attribute at all, so Zoom's `jbh_time` setting
-- ("participants may join at most N minutes before the start") has nothing to
-- count back from and silently stays at 0. Combined with
-- join_before_host: true, that is why a personal join link opens the room at
-- any hour, on any day, forever.
--
-- Fixing that means a fixed-time recurring meeting (type 8), which needs to
-- know how long a session runs and which days it repeats on. Neither was
-- recorded anywhere: 202608060051_attendance_session_minutes.sql already ran
-- into the first half of this — "batches carries a start_time but no
-- end_time" — and had to measure session length from Zoom's own reports
-- instead.
--
-- Both are NULLABLE and there is no backfill. Existing batches have no
-- recorded schedule and inventing one would produce wrong join windows for
-- live cohorts; they keep their current Course-level meeting until they
-- finish, at which point the post-course revocation added in
-- 202608080055 closes it. Only batches created with a full schedule get a
-- time-boxed classroom (see createBatch in modules/courses/service.ts).
alter table public.batches
    add column end_time time,
    -- Zoom's own weekly_days encoding, stored verbatim so no translation
    -- layer can get it wrong: 1 = Sunday ... 7 = Saturday.
    add column meeting_days smallint[];

alter table public.batches
    add constraint batch_end_time_after_start_time
        check (end_time is null or end_time > start_time);

alter table public.batches
    add constraint batch_meeting_days_valid
        check (
            meeting_days is null
            or (
                array_length(meeting_days, 1) between 1 and 7
                and meeting_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
            )
        );

comment on column public.batches.end_time is
    'Local (Africa/Accra) time a single class session ends. Null on batches created before 2026-08-08, which have no time-boxed Zoom classroom. Also the honest denominator for the attendance-rate rule, which currently infers session length from Zoom reports.';

comment on column public.batches.meeting_days is
    'Which days of the week this cohort meets, in Zoom''s weekly_days encoding (1 = Sunday ... 7 = Saturday). Null means no recorded schedule, so no fixed-time Zoom meeting is created.';

commit;
