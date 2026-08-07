-- Attendance matching provenance (2026-08-06).
--
-- The Zoom sync matches a participant report row to a Registration by the
-- registered email. That only works when the participant joined through a
-- personal registrant link; when a Batch shares one join link, Zoom's report
-- carries a self-typed display name and no email at all (on the 2026-08-06 ESG
-- session, 1 of 286 attendees carried an email). Those sessions therefore
-- recorded nothing, and on a free Batch that also blocks every certificate —
-- isCertificateEligible swaps the payment gate for attendance.
--
-- Name matching closes the gap, but it is an inference, not an observation, so
-- it gets its own source value rather than masquerading as 'zoom_sync'. Staff
-- reviewing a roster can tell exactly how each row was established.

begin;

alter table public.attendance
    drop constraint if exists attendance_source_check;

alter table public.attendance
    add constraint attendance_source_check
        check (source in ('zoom_sync', 'zoom_name_match', 'manual_correction'));

comment on column public.attendance.source is
    'zoom_sync: matched to a Registration by registrant id or registered email (observed). '
    'zoom_name_match: matched by unambiguous display-name comparison (inferred — review before relying on it). '
    'manual_correction: written by staff approving an attendance_exceptions row.';

commit;
