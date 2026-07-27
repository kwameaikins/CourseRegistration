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
- A tutor can never see any payment/financial field for any participant (BR-33).
- Attendance has no tutor-facing write path in v1; it remains exclusively cron/Zoom-sync-owned
  (BR-34).
- Staff can no longer create a `staff_users` account with role `tutor` — the role no longer
  exists in the schema's CHECK constraint, the app's `StaffRole` type, or any role allow-list.
- A tutor's next-class Zoom link is visible and clickable from their portal — the exact gap
  that existed on the old `/my-courses` page.

## 10. New Business Rules

See `04_Business_Logic_Rules.md`'s "Tutor Portal Rules" section — BR-31 through BR-34.
