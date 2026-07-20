-- Certificate system (founder-approved 2026-07-19), replacing the Google
-- Sheets + AppScript registry.
--
-- Numbering: KNS-<COURSECODE>-<YEAR>-<NNNN> (founder-chosen prefix, same
-- shape as the legacy registry's KNW-AI01-2026-0036). PDFs are generated on
-- demand from this row (no
-- file storage); the public verification page and download link are keyed by
-- certificate_number and the unguessable row UUID respectively.
--
-- Issuance paths: batch issue (Paid + feedback-submitted eligibility with
-- attendance shown for admin judgment) and manual issue (any recipient — for
-- backfilling the old registry and walk-in cases; registration_id null).

begin;

create table public.certificates (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid references public.registrations(id) on delete cascade,
    certificate_number  text not null unique,
    recipient_name      text not null,
    course_title        text not null,
    description         text not null default '',
    hours               integer not null default 0,
    cpd_credit          text not null default 'TBD',
    issued_date         date not null default current_date,
    issued_by           uuid references public.staff_users(id),
    recipient_email     text,
    revoked             boolean not null default false,
    revoked_reason      text,
    created_at          timestamptz not null default now(),
    unique (registration_id)
);

comment on table public.certificates is
    'Certificate registry. One per Registration for batch issues; registration_id null for manual/backfilled issues. PDFs are regenerated on demand from this row.';

create index idx_certificates_number on public.certificates(certificate_number);

alter table public.certificates enable row level security;

-- Admin manages the registry; Management may review it. Public verification
-- and downloads run via the service-role client.
create policy admin_manage_certificates
on public.certificates for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy management_read_certificates
on public.certificates for select
to authenticated
using (public.fn_current_role() = 'management');

grant select, insert, update, delete on table public.certificates to authenticated;

commit;
