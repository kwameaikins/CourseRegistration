-- Learning resources belong to the COURSE, not the cohort (founder, 2026-09-19:
-- "course materials and resources uploaded are per cohort, meaning every cohort
-- you would have to re-upload the same materials again").
--
-- A material now carries `course_id` (always) and `batch_id` (only when it is
-- for ONE cohort — a session recording, a one-off handout). A row with
-- batch_id NULL is the course library and every cohort of the course sees it
-- automatically; a row with batch_id set is that cohort's alone. Measured
-- before writing: 20 materials, all links, every course with exactly one
-- cohort — so every existing unpinned row is promoted to the course library,
-- which is exactly what the founder asked for, and nothing has to be
-- de-duplicated.
--
-- The same shape for the Drive "resources" link: `courses.resources_link` is
-- the default every cohort inherits; `batches.resources_link` stays as the
-- per-cohort override. Existing batch links are copied up as the course's
-- default (one cohort each, so nothing conflicts).
begin;

alter table public.session_materials
    add column course_id uuid references public.courses(id) on delete cascade;

update public.session_materials m
set course_id = b.course_id
from public.batches b
where b.id = m.batch_id;

alter table public.session_materials
    alter column course_id set not null;
alter table public.session_materials
    alter column batch_id drop not null;

-- Promote: an unpinned material is the course's. A material pinned to a live
-- session stays with that cohort (a session is one cohort's occurrence).
update public.session_materials
set batch_id = null
where live_session_id is null;

create index session_materials_course_created_at_idx
    on public.session_materials (course_id, created_at desc);

comment on table public.session_materials is
    'Learning resources (link or R2 file). course_id always; batch_id NULL = the course library, seen by every cohort; batch_id set = one cohort only.';
comment on column public.session_materials.course_id is
    'The course this resource teaches. Every cohort of the course sees it unless batch_id narrows it to one.';
comment on column public.session_materials.batch_id is
    'NULL for a course-library resource. Set only for a resource that belongs to one cohort (e.g. pinned to a live session).';

alter table public.courses
    add column resources_link text;

update public.courses c
set resources_link = b.resources_link
from public.batches b
where b.course_id = c.id and b.resources_link is not null and c.resources_link is null;

comment on column public.courses.resources_link is
    'Default materials folder link every cohort inherits (2026-09-19). batches.resources_link overrides it for one cohort.';

commit;
