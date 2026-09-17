-- One certificate registry for both platforms (founder decision 2026-09-17).
--
-- Knowsia Study (KnowsiaApp) issues a certificate when a self-paced course is
-- completed. Its course codes are the same as ours (CA01–CA04 …), and the
-- KNS-<CODE>-<YEAR>-<NNNN> serial is allocated PER CODE PER YEAR from this
-- table — so a second issuer would produce the same number twice. Instead it
-- asks this registry for the number (POST /api/integration/certificates/issue)
-- and the row lives here: one series, one verifier, the printed
-- reg.knowsia.com/verify/<number> URLs valid for everyone.
--
-- external_ref: the caller's own certificate id, UNIQUE, so a retry after a
-- timeout finds the row it already created instead of burning a second serial.
-- source: 'cohort' (every row so far) or 'self_paced', for the registry list.

begin;

alter table public.certificates
    add column external_ref text unique,
    add column source text not null default 'cohort';

alter table public.certificates
    add constraint certificates_source_check check (source in ('cohort', 'self_paced'));

comment on column public.certificates.external_ref is
    'The issuing platform''s own id for this certificate (Knowsia Study m2_course_certificates.id). Unique: a retried issue call returns the existing row.';
comment on column public.certificates.source is
    'cohort (issued here for a Batch) or self_paced (issued for Knowsia Study on completion of a recorded course).';

commit;
