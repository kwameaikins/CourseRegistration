-- Staff-editable public course copy (founder-requested 2026-08-16).
--
-- Until now the programme catalogue's marketing prose lived only in
-- modules/courses/public-content.ts, which meant a wording fix needed a
-- developer and a deploy. That file's own header anticipated this move:
-- "If staff later need to edit copy without a developer, this file is the
-- thing to migrate into columns."
--
-- WHY JSONB RATHER THAN COLUMNS AND CHILD TABLES
-- ---------------------------------------------
-- The shape is one document with four nested repeating structures (curriculum
-- modules, each with its own bullet list; FAQ entries; format rows; several
-- audience lists). Relationally that is six tables and six editors, and every
-- read reassembles the whole document anyway — contentForCourseCode returns
-- the entire object or nothing. Nothing queries across courses by a field
-- inside the copy, and nothing joins to it. So the document is stored as a
-- document, and its shape is enforced in application code by
-- courseContentBodySchema (modules/courses/types.ts) on every write, which is
-- also what produces the editor's validation messages.
--
-- WHAT IS STILL NOT HERE: prices, dates, times and seat counts. Those remain
-- on the Batch and are read live, exactly as before, so a programme page can
-- never advertise a fee the registration form then contradicts. Moving copy
-- into the database does not change that boundary.
--
-- THE CODE MAP IS NOT DELETED. public-content.ts stays as the fallback: a
-- course with no row here renders from code exactly as it does today. That is
-- what lets this ship without a data migration and without any course losing
-- its copy midway.
begin;

create table public.course_content (
    -- One row per course, so the course IS the key. Cascade because copy for a
    -- deleted course is meaningless, not something to orphan.
    course_id     uuid primary key references public.courses(id) on delete cascade,
    body          jsonb not null,
    -- Catalogue ordering. NULL means "fall back to the order the code map
    -- declares", which is how the catalogue has always sorted — see
    -- contentRank in modules/courses/public-catalog.ts.
    display_order integer,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    -- Null for a row written by a migration or a script rather than a person.
    updated_by    uuid references public.staff_users(id)
);

comment on table public.course_content is
    'Staff-editable public marketing copy for one course, as a single JSONB document matching CoursePublicContent in modules/courses/public-content.ts. Validated by courseContentBodySchema (modules/courses/types.ts) on every write; the database deliberately does not constrain the document shape. Falls back to the hard-coded map in modules/courses/public-content.ts when no row exists. Never holds prices, dates, times or seat counts — those live on batches and are read live.';

comment on column public.course_content.display_order is
    'Ascending catalogue position. NULL means fall back to the order declared by COURSE_PUBLIC_CONTENT, preserving the ordering the catalogue had before this table existed.';

create index idx_course_content_display_order
    on public.course_content(display_order)
    where display_order is not null;

alter table public.course_content enable row level security;

-- Mirrors public.courses exactly: admin writes, every other staff role reads.
-- Editing public-facing copy is the same class of act as editing the course
-- itself, so it gets the same gate rather than a new one. The public
-- catalogue read does not rely on these policies at all — it goes through the
-- service-role client (selectAllCourseContentSystem), same as every other
-- public read in this codebase.
create policy admin_full_course_content
on public.course_content for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy read_course_content
on public.course_content for select
to authenticated
using (public.fn_current_role() in ('finance', 'marketing', 'management'));

commit;
