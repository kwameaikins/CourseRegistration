# Tutor Operations Specification

Companion to `01_PRD.md`. Describes the Tutor Portal — a dedicated, PIN-protected portal for
external course facilitators, replacing the earlier staff-role-based Tutor experience
(`/my-courses`, retired 2026-07-27).

## 1. Operating Model

A **Tutor** is an external facilitator who teaches Knowsia courses — not a Knowsia employee,
not a `staff_users` row, not a Supabase Auth login. Before this feature, "Tutor" was one of
five `staff_users.role` values, which was the wrong foundation: it gave tutors a staff-tier
identity for a relationship that is actually external, and in practice it produced a nearly
unusable single page (a roster with no Zoom join link, and zero attendance/certificate
visibility, since RLS granted tutors no access to either table at all). The Tutor Portal
corrects the model: tutors get their own external-party identity, same architecture as the
participant and company portals.

## 2. Source of Truth

- `tutors` is a standalone table — deliberately not `staff_users`. Staff create a tutor record
  (name, email, phone) from the `/tutors` screen; that's what seeds portal access.
- A batch's teacher-of-record display name remains `batches.facilitator_name` (required free
  text, unchanged — every existing consumer of it, certificates included, keeps working as-is).
  `batches.facilitator_tutor_id` and `live_sessions.tutor_id` are the new scoping links used
  only to determine which batches/sessions a tutor's portal session can see.
- The legacy `batches.facilitator_staff_id` / `live_sessions.tutor_staff_id` columns (pointed at
  `staff_users`) are left in place but no longer written to by new code — a deliberate,
  additive migration rather than retargeting an existing FK against unknown production data. A
  later cleanup migration can drop them once confirmed empty.
- Roster, attendance, and certificate-eligibility data are never duplicated for the tutor
  portal — every read re-queries the same tables the staff screens use (`registrations`/
  `participants`, `attendance`, `certificates`' eligibility computation), just re-scoped through
  the tutor's own session instead of staff RLS.

## 3. Module Boundaries

`modules/tutors` owns `tutors`, `tutor_auth`, `tutor_sessions`, the staff-facing `/tutors`
management screen, and the tutor portal's auth/dashboard reads — one module per domain, same
precedent as `modules/corporate` owning both `companies` and the company portal together. It
makes read-only cross-module calls to `attendanceService.getAttendanceForBatch` and
`certificatesService.getBatchIssueContext` (the exact same functions staff already use — the
tutor portal is just a differently-authorized caller), and never writes to either module.

## 4. Core Entities

- **Tutor** — `full_name`, `email` (unique), `phone`. Created by staff via `/tutors`.
- **Tutor Auth** (`tutor_auth`/`tutor_sessions`) — the tutor's own portal identity, one row per
  tutor, seeded automatically at creation time from the phone number's last 4 digits.
- **Batch/Live Session assignment** — `batches.facilitator_tutor_id` and
  `live_sessions.tutor_id`, set from the `/tutors`-populated picker on the Courses and Live
  Sessions staff screens.

## 5. Role Responsibilities

- **Admin / Management**: create/edit tutor records (`/tutors`), assign tutors to
  batches/sessions from the Courses and Live Sessions screens.
- **Tutor** (portal): see their own teaching schedule (with a working Zoom join link — the gap
  the old staff page had), roster, attendance, and certificate-eligibility for their own
  batches only; edit their own contact details and PIN. No write access to attendance,
  certificates, or any payment field, ever.

## 6. Security, Privacy, and Audit Controls

- Tutor portal auth mirrors the participant and company portals exactly: PIN + opaque session
  cookie (`tutor_portal_session`), not Supabase Auth. `tutor_auth`/`tutor_sessions` have RLS
  enabled with **zero policies** — reachable only via the service-role client, same "RLS as
  defense in depth, application code is the real gate" posture used throughout this system's
  non-staff identity tiers.
- `tutors` itself uses real RLS policies keyed on `fn_current_role()` (admin/management only),
  matching every other staff-managed table.
- Lockout: 5 failed PIN attempts locks the tutor session for 15 minutes (BR-31 area, same
  parameters as the other two portals).
- BR-32 is enforced entirely in the service layer: every batch-scoped read
  (`getRosterForBatch`/`getAttendanceForBatch`/`getCertificateEligibilityForBatch`) verifies the
  batch belongs to the calling tutor's own session before returning anything.
- BR-33: the roster query never selects the `payments` table — not a field-strip after the
  fact, the query itself has no payment join.

## 7. Tutor Portal Experience

Login (email + PIN) → dashboard with: an Overview (next class banner, course/session counts), a
Schedule (every assigned batch with its Zoom link, and every scheduled session), a Roster and
Attendance view per batch (read-only), a Certificate Eligibility view per batch (visibility
only — issuance stays an admin action from the existing Certificates screen), and an Account
section for self-service name/phone correction and PIN change.

## 8. Delivery Roadmap

- **Phase 1** (shipped 2026-07-27): schema (`tutors`, `tutor_auth`, `tutor_sessions`, the two
  new scoping columns), retirement of the staff Tutor role end-to-end (RLS policies, role
  enums, API allow-lists, the `/my-courses` page), the `/tutors` staff management screen, and
  the tutor picker on the Courses/Live Sessions screens.
- **Phase 2** (shipped 2026-07-27): the tutor portal itself — auth, dashboard, roster,
  attendance, certificate eligibility, account self-service.
- **Phase 3** (this document + doc updates): documentation.
- Not yet built (future, from the original Live Learning Operations "Tutor workspace" vision —
  Document 14 Section 6/8 — now superseded by this document as the source of truth for what's
  actually shipped): session materials/agenda upload, no-show flagging, learner follow-ups,
  substitute handover, recording release, a tutor-facing attendance-correction/review path.

## 9. Acceptance Criteria

- A tutor portal session can never read or write another tutor's batches, roster, attendance,
  or certificate data (BR-32).
- A tutor can never see any participant's payment **amount** (BR-33, revised 2026-08-13). A
  boolean settled/unsettled flag is permitted where it explains certificate eligibility, and
  nowhere else; the roster read still has no `payments` join at all.
- Attendance has no tutor-facing write path in v1; it remains exclusively cron/Zoom-sync-owned
  (BR-34).
- Staff can no longer create a `staff_users` account with role `tutor` — the role no longer
  exists in the schema's CHECK constraint, the app's `StaffRole` type, or any role allow-list.
- A tutor's next-class Zoom link is visible and clickable from their portal — the exact gap
  that existed on the old `/my-courses` page.

## 10. New Business Rules

See `04_Business_Logic_Rules.md`'s "Tutor Portal Rules" section — BR-31 through BR-34.

## 11. Phase 4 — Extended Access (founder-approved 2026-07-31)

A follow-up review of "what access should a tutor have, per best practice" compared the
shipped v1 against the original Live Learning Operations vision (`14_Live_Learning_Operations.md`
§4/§6/§8 — materials, no-show flagging, learner follow-ups, substitute handover, recording
release, attendance-correction review) plus a few new suggestions. The founder chose to build
the highest-value, lowest-risk items now and defer the rest.

### Shipped this phase

- **Tutor action audit log** (`tutor_action_audit_log`, migration `202607290037`) — every
  tutor-portal self-service write (PIN change, contact edit, attendance exception raised,
  material added/removed) is now logged. Previously none of this was logged at all. Staff view:
  a "Recent tutor activity" list on `/tutors`.
- **Attendance Exceptions** (`attendance_exceptions`, migration `202607290038`) — a tutor can
  flag a no-show or request an attendance correction on their own batch's roster. Always starts
  `pending`; a tutor never writes to `attendance` directly (BR-34 unchanged) — only an admin's
  approval (`/attendance` screen) can apply a correction, and approving a `no_show_flag` is
  advisory only. `attendance.source` (`zoom_sync` | `manual_correction`) distinguishes
  cron-written rows from admin-approved corrections.
- **Session Materials** (`session_materials`, migration `202607290039`) — a tutor can share a
  material link (slides/agenda/readings) per batch, visible to staff (`/live-sessions`) and the
  batch's enrolled participants (student portal, new Materials tab). Deliberately link-based, not
  a file upload — same precedent as `batches.resources_link` (migration `202607280036`, which
  chose a link over building file storage).
- **Registered-student count** — `TutorPortalBatch.registeredCount` (a plain roster count, not a
  payment field) is now visible on the tutor's schedule/roster/attendance batch selector.
- **Bug fix**: the tutor-portal Attendance panel (`getAttendanceForBatch`) was silently returning
  empty results — `modules/attendance/repository.ts`'s `selectAttendanceForBatch` used the
  staff-session RLS client, which returns zero rows for a tutor-portal caller (no Supabase Auth
  session). Added `selectAttendanceForBatchSystem`/`getAttendanceForBatchSystem` (service-role
  client, same posture as every other tutor-portal read) and repointed the tutor-portal caller at
  it. The staff-facing function is unchanged.

## Phase 5 (2026-08-04) — Learning resource uploads and assignments

Founder request: "Tutors or admin should be able to upload learning resources and students able to
submit assignments."

### Learning resources are now real file uploads

`session_materials` gained `file_path` / `file_name` / `file_size_bytes` / `content_type` plus
`uploaded_by_staff_id` (migration `202608040049`). A material is now **either** a link **or** an
uploaded file, never both and never neither — enforced by
`chk_session_materials_link_xor_file`, with `SessionMaterial.kind` as the discriminator the UI
switches on. Every pre-existing row is a link and stays valid untouched.

This is not a scope change: Document 14 §4 always specified `session_materials` as "Agenda, slides,
readings, assignments" and §6 always gave the Tutor role "upload materials". The link-only shape
was a shortcut taken because no file storage existed in this codebase at the time (see the
`202607290039` header). Cloudflare R2 landed on 2026-08-02, so that constraint is gone.

Files live in R2 (`lib/r2/client.ts`), keyed by `file_path`; bytes and public URLs never touch
Postgres. Downloads are short-lived presigned GET URLs fetched on click, so a signed credential
never sits in the DOM. Admin can now author and delete materials on any batch from
`/live-sessions`; management still reads only.

**Where the files actually go.** One R2 bucket (`knowsia-course-bucket`) holds every upload in
this app, so the object key is what organises it. Every key is built by `lib/r2/keys.ts` and
nowhere else — a new upload type gets a new prefix there, never a new bucket:

```
slips/<registrationId>/<uuid>.<ext>                        payment slips
materials/<batchId>/<uuid>.<ext>                           learning resources
submissions/<assignmentId>/<registrationId>/<uuid>.<ext>   student submissions
```

Shape is always `<content type>/<owning aggregate>[/<sub-scope>]/<random uuid>.<ext>`, so each
type can be listed or lifecycle-ruled on its own, and everything belonging to one registration,
batch, or assignment is a single prefix listing — which is what a DPA erasure request or an
end-of-cohort cleanup actually needs. The filename is always a fresh UUID, never the uploader's
(untrusted input; the display name lives in `session_materials.file_name` /
`assignment_submissions.file_name`), and the extension comes from the validated MIME type.

All three prefixes were normalised on 2026-08-05, while the bucket was still empty — payment
slips had previously been written to the bucket *root* as `<registrationId>/<uuid>.<ext>`. Treat
the prefixes as fixed now: changing one orphans existing objects (old rows keep resolving, since
the database stores whole keys, but new writes land elsewhere).

### Assignments and student submissions — NEW SCOPE, flagged

**This exceeds the documented product scope and was built at explicit founder request.** PRD §9
lists course content delivery as out of scope ("This is a management system, not an LMS"), and
Document 14 §6 gives the Student role no submit capability. Flagged per CLAUDE.md rule 10 and
built anyway on the founder's 2026-08-04 instruction.

It is deliberately **not** an LMS gradebook. Shape follows the codebase's existing
"submitter-raised row, reviewer acts on it" pattern (`attendance_exceptions`,
`payment_submissions`):

- `assignments` — batch-scoped, authored by a tutor (their own batches) or an admin (any batch).
  Title, optional instructions, optional `due_at`, `status` (`open`/`closed`), `allow_resubmission`.
- `assignment_submissions` — **one current submission per Registration per Assignment** (a plain
  unique index, not the partial one `payment_submissions` needed). A resubmission overwrites the
  row in place and **clears any grade/feedback given against the file it replaces** — a mark must
  never appear to apply to work it wasn't given for. No version history, by design.
- Optional 0–100 `grade` plus free-text `feedback`. A tutor may acknowledge without scoring.
- Nothing here touches certificates, attendance, payments, or registration status.

`modules/assignments` is its own module rather than part of `modules/live-sessions` because
Document 14 §3 states live-sessions "must not directly change payment status, registration status,
certificates, or **grades**" — and a review writes a grade.

### Authorization

Neither new table has a tutor- or participant-facing RLS policy: no portal session is a Supabase
Auth session (BR-31), so **the service layer is the security boundary**, same as
`session_materials` and `payment_submissions` already are. Two checks, both server-side:

- Tutors — `requireOwnBatch`, and a new `requireOwnAssignment` that resolves an assignment (or a
  submission → its assignment) back to its batch before any read or write. A submission id alone
  never implies ownership.
- Students — the registration must belong to the calling session **and** the material/assignment
  must belong to that registration's own batch. Checking only the registration would let a learner
  submit against another cohort's assignment using their own registration id.

Covered by `tests/unit/assignments-service.test.ts`,
`tests/unit/portal-assignments-access.test.ts`, and additions to
`tests/unit/tutors-service.test.ts`.

### Deliberately not built

- **Staff marking of individual submissions.** Document 14 §6 makes marking a tutor
  responsibility, and staff would need learner names merged in — which `modules/assignments`
  cannot do (module boundary: it must not read `participants`/`registrations`) and which
  `registrationsService.listRegistrations` cannot supply either (its role gate excludes
  `management`, and it is paginated). Staff see submission/review **counts** per assignment;
  the tutor portal is the grading surface. `assignment_submissions.reviewed_by_staff_id` exists
  so this can be added later without a migration — only the tutor column is written today.
- **Upload size beyond 20MB.** Vercel Hobby caps a serverless request body at 4.5MB, so larger
  files fail at the platform edge regardless. Revisit alongside direct-to-R2 presigned uploads.
- **Deleting the R2 object when a material or assignment is deleted.** The bucket is private and
  orphans cost effectively nothing at this scale; a delete that half-succeeds is worse than a tidy
  one that never runs.

### Explicitly considered and declined for now

- **Tutor payment/financial visibility** — raised by the founder mid-build ("tutors should also
  see how much payment received"). Deferred pending a scope decision: an aggregate batch total
  vs. per-student amounts.

  **Half-settled 2026-08-13**, by an authorization review rather than a feature request. The
  review found the Certificate Eligibility panel had been showing a per-participant Paid/Unpaid
  pill since it shipped, contradicting BR-33 as then worded and contradicting this section's own
  claim that nothing of the sort was built. Founder decision: the **boolean stays** — it is what
  makes an eligibility verdict legible on a paid Batch — and BR-33 was rewritten around the real
  line, which is *status vs. figure*, not *payment vs. no payment*.

  **Still not built, still needs sign-off: AMOUNTS.** No `amount_paid`, `course_fee`, balance,
  payment date, method or reference may appear in any tutor-facing payload, and the roster read
  must keep having no `payments` join. `tests/unit/tutor-payment-isolation.test.ts` pins this.

### Deferred to a future phase (not built, no shape committed except where noted)

- **Recording release** — same link-based shape as Session Materials envisioned (a
  `session_recordings` table: link + tutor-approval-before-visible flag), not a storage/provider
  integration.
- **Learner follow-up notes** — a tutor flags a specific participant with a note visible to
  staff; likely surfaces on the Registration 360° view (`GET /api/registrations/[id]`).
- **Substitute handover** — a tutor *requests* a substitute for a session; an admin still
  performs the actual `live_sessions.tutor_id` reassignment via the existing Live Sessions
  screen, keeping that write staff-only.
- **Availability/blackout dates** — a `tutor_availability` table, self-service add/remove; v1
  would be visibility-only on the staff tutor-picker, not an enforced constraint.
- **Tutor→roster messaging** — **suspended**: the founder deferred deciding between
  auto-send-and-log vs. staff-pre-approval, so no shape is committed.
- **Tutor compensation tracking** — founder specified *full* rate-based tracking (rate per
  session/batch, admin-set rate card, tutor sees computed earnings) as the target shape when
  this is eventually built, but it remains entirely deferred: there is no confirmed business
  rule yet for what counts as a payable session, and no rate-card concept exists anywhere in the
  schema.
