begin;

-- Facilitator attribution on the certificate (founder request 2026-08-08).
--
-- Snapshotted onto the certificate row, NOT joined live from the batch, for
-- the same reason course_title, description, hours and cpd_credit already
-- are: certificate PDFs are regenerated on demand from this row
-- (getCertificatePdf in modules/certificates/service.ts), never stored. A
-- live join would mean that reassigning a batch's facilitator silently
-- rewrites who taught the course on every certificate ever issued for it —
-- including ones already downloaded, emailed and publicly verified.
--
-- Nullable with no backfill. Certificates issued before today have no
-- recorded facilitator, and the batch's CURRENT facilitator is not evidence
-- of who actually taught that cohort. Those certificates simply omit the
-- line rather than assert something unverified.
alter table public.certificates
    add column facilitator_name text;

comment on column public.certificates.facilitator_name is
    'Who facilitated the cohort, captured at issue time from batches.facilitator_name. Null on certificates issued before 2026-08-08, which render without the attribution line.';

commit;
