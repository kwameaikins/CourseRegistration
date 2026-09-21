-- Tutors are people too (Coding Docs/26 R2, 2026-09-21): the same tutor now
-- teaches from the study app, so their Core identity (Doc 22 §3) is what
-- joins this app's tutor record to that account. Same shape as the
-- participants and staff columns from 202609180070: a shared KEY set by the
-- linker in knowsia-api by exact email, never a merge.
begin;

alter table public.tutors
    add column core_identity_id uuid;

create index tutors_core_identity_idx on public.tutors (core_identity_id)
    where core_identity_id is not null;

comment on column public.tutors.core_identity_id is
    'Knowsia Core identity this tutor belongs to (Doc 26 R2). A shared key set by the linker, exact email only.';

commit;
