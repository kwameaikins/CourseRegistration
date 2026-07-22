-- Course-level Zoom link (system review, 2026-07-22): a persistent Zoom
-- meeting created once per Course (not per Batch) so every cohort of that
-- course shares the same classroom link. Batches keep their own zoom_link/
-- zoom_meeting_id columns (attendance sync and communications templates
-- read from the Batch, unchanged) but the values are now copied from the
-- parent Course at batch-creation time instead of typed per batch.
begin;

alter table public.courses
    add column zoom_link       text,
    add column zoom_meeting_id text;

comment on column public.courses.zoom_link is
    'Auto-created (or manually set as a fallback) Zoom join link, shared by every Batch of this Course.';
comment on column public.courses.zoom_meeting_id is
    'Numeric Zoom meeting ID backing zoom_link, used for registrant sign-up and attendance sync.';

commit;
