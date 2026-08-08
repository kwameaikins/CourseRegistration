begin;

-- Closing the classroom when a course is over (founder-flagged 2026-08-08).
--
-- Every classroom meeting is created as Zoom type 3 — recurring, NO FIXED
-- TIME — with `join_before_host: true` and `waiting_room: false` (see
-- createZoomMeeting in lib/zoom/client.ts). That combination means a personal
-- registrant link never stops working: months after a cohort ends, anyone
-- still holding the link from their confirmation email can open the meeting
-- themselves, at any hour, with no host present.
--
-- Hiding the link in the portal does not fix that — by then the link is in
-- the student's inbox. The registrant itself has to be revoked on Zoom's
-- side, which is what runPostCourseZoomRevocation does, using the same
-- denyMeetingRegistrant call the access-grant expiry sweep uses.
--
-- This column is the idempotency marker. Without it the nightly sweep would
-- re-deny every registrant of every finished batch forever; with it, each
-- batch is processed exactly once and the timestamp doubles as an audit of
-- when the classroom was closed.
alter table public.batches
    add column zoom_access_revoked_at timestamptz;

comment on column public.batches.zoom_access_revoked_at is
    'When this batch''s Zoom registrants were denied after the course finished. Null means not yet swept (or no Zoom meeting). Set once by runPostCourseZoomRevocation; clearing it would cause the sweep to run again.';

-- Partial index: the sweep only ever asks for batches it has NOT yet closed,
-- and that set shrinks to near-nothing in steady state.
create index batches_pending_zoom_revocation_idx
    on public.batches (end_date)
    where zoom_access_revoked_at is null and zoom_meeting_id is not null;

commit;
