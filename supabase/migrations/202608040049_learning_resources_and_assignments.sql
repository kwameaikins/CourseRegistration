-- Learning resources (file uploads) + student assignment submissions
-- (founder-requested 2026-08-04).
--
-- Part 1 — session_materials gains real file uploads.
--   Migrations 202607280036 (batches.resources_link) and 202607290039
--   (session_materials) both chose a plain link "rather than building file
--   storage" — a shortcut taken because no file storage existed in this
--   codebase at the time. Cloudflare R2 landed on 2026-08-02 (migration
--   202608010043, payment slips, lib/r2/client.ts), so that constraint is
--   gone. This completes what Document 14 §4/§6 always specified:
--   `session_materials` = "Agenda, slides, readings, assignments" with the
--   tutor able to "upload materials".
--   A material is now EITHER a link OR an uploaded file, never both and
--   never neither (chk_session_materials_link_xor_file). Every existing row
--   is a link and stays valid untouched.
--
-- Part 2 — assignments + assignment_submissions (NEW SCOPE).
--   Flagged per CLAUDE.md rule 10: PRD §9 lists course content delivery as
--   out of scope ("This is a management system, not an LMS") and Document 14
--   §6 gives the Student role no submit capability. The founder asked for it
--   on 2026-08-04 regardless. It is deliberately built in this codebase's
--   existing "submitter-raised row, reviewer acts on it" shape (the same
--   shape as attendance_exceptions/202607290038 and payment_submissions/
--   202608010043), NOT as a general LMS gradebook: one current submission
--   per student per assignment, an optional tutor grade, and nothing that
--   touches certificates, attendance, or payment.
--
--   Grading lives in its own `modules/assignments`, not in
--   `modules/live-sessions` — Document 14 §3 states live-sessions "must not
--   directly change payment status, registration status, certificates, or
--   grades", so a separate module is what that boundary requires.
--
-- Uploaded bytes live in Cloudflare R2 and are keyed by these tables'
-- `file_path` column only. No file bytes and no public URL are ever stored
-- in Postgres, same posture as payment_submissions.slip_file_path.

begin;

-- === Part 1: file-backed session materials ===================================

alter table public.session_materials
    alter column link drop not null;

alter table public.session_materials
    add column file_path       text,
    add column file_name       text,
    add column file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
    add column content_type    text,
    -- Admin/management can now upload materials too, not just tutors; the
    -- existing uploaded_by_tutor_id stays for tutor-portal uploads.
    add column uploaded_by_staff_id uuid references public.staff_users(id) on delete set null;

alter table public.session_materials
    add constraint chk_session_materials_link_xor_file
    check ((link is not null) <> (file_path is not null));

alter table public.session_materials
    add constraint chk_session_materials_file_metadata
    check (file_path is null or (file_name is not null and content_type is not null));

comment on table public.session_materials is
    'Tutor/staff-shared learning resources per batch, optionally scoped to one live session. Each row is either a link or an R2-backed uploaded file (chk_session_materials_link_xor_file) — file_path is an R2 object key, never bytes or a public URL.';

comment on column public.session_materials.file_path is
    'Cloudflare R2 object key. Downloads are served as short-lived presigned URLs; the bucket stays private.';

-- === Part 2: assignments =====================================================

create table public.assignments (
    id                    uuid primary key default gen_random_uuid(),
    batch_id              uuid not null references public.batches(id) on delete cascade,
    live_session_id       uuid references public.live_sessions(id) on delete set null,
    title                 text not null check (char_length(trim(title)) between 2 and 200),
    instructions          text,
    due_at                timestamptz,
    -- Closing an assignment stops new/updated submissions without deleting
    -- anything already submitted (no hard delete after students have acted,
    -- same principle as live_sessions' "no hard delete after publishing").
    status                text not null default 'open'
                              check (status in ('open', 'closed')),
    allow_resubmission    boolean not null default true,
    -- Exactly one author: a tutor (tutor portal) or a staff member (/live-sessions).
    created_by_tutor_id   uuid references public.tutors(id) on delete set null,
    created_by_staff_id   uuid references public.staff_users(id) on delete set null,
    created_at            timestamptz not null default now()
);

comment on table public.assignments is
    'Tutor/staff-set coursework for a batch. NEW SCOPE 2026-08-04 (PRD §9 lists content delivery as out of scope) — deliberately minimal: no weighting, no rubric, no gradebook rollup, and no effect on certificates, attendance, or payment.';

create index assignments_batch_created_at_idx
    on public.assignments (batch_id, created_at desc);

alter table public.assignments enable row level security;

-- Same staff role gate as the /live-sessions screen (lib/auth/roles.ts).
create policy admin_full_assignments
on public.assignments for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy management_read_assignments
on public.assignments for select
to authenticated
using (public.fn_current_role() = 'management');

grant select, insert, update, delete on table public.assignments to authenticated;

-- === Part 2b: assignment submissions =========================================

create table public.assignment_submissions (
    id                    uuid primary key default gen_random_uuid(),
    assignment_id         uuid not null references public.assignments(id) on delete cascade,
    registration_id       uuid not null references public.registrations(id) on delete cascade,
    -- The submission IS a file — unlike a payment slip, it is never optional.
    file_path             text not null,
    file_name             text not null,
    file_size_bytes       bigint not null check (file_size_bytes > 0),
    content_type          text not null,
    participant_notes     text,
    submitted_at          timestamptz not null default now(),
    status                text not null default 'submitted'
                              check (status in ('submitted', 'reviewed')),
    -- Optional: a tutor may simply acknowledge a submission without scoring it.
    grade                 numeric(5,2) check (grade is null or (grade >= 0 and grade <= 100)),
    feedback              text,
    reviewed_by_tutor_id  uuid references public.tutors(id) on delete set null,
    reviewed_by_staff_id  uuid references public.staff_users(id) on delete set null,
    reviewed_at           timestamptz
);

comment on table public.assignment_submissions is
    'One current submission per Registration per Assignment. A resubmission overwrites the row in place (and clears any prior review) rather than accumulating versions — deliberate: this is not an LMS version history.';

-- One current submission per student per assignment. Resubmission is an
-- UPDATE of this row, which is why this is a plain unique constraint and not
-- the partial index payment_submissions needed for its accumulating history.
create unique index assignment_submissions_one_per_registration
    on public.assignment_submissions (assignment_id, registration_id);

create index assignment_submissions_assignment_submitted_at_idx
    on public.assignment_submissions (assignment_id, submitted_at desc);
create index assignment_submissions_registration_idx
    on public.assignment_submissions (registration_id);

alter table public.assignment_submissions enable row level security;

create policy admin_full_assignment_submissions
on public.assignment_submissions for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy management_read_assignment_submissions
on public.assignment_submissions for select
to authenticated
using (public.fn_current_role() = 'management');

grant select, insert, update, delete on table public.assignment_submissions to authenticated;

-- No tutor- or participant-facing RLS policy on either new table: neither has
-- a Supabase Auth session for RLS to key off (BR-31). Both read/write through
-- the service-role client, gated in the application layer — requireOwnBatch
-- for tutors, and the participant portal's own registration-ownership check
-- for students, exactly as session_materials already does.

commit;
