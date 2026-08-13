# Live Learning Operations Specification

**Status:** Approved architecture and implementation roadmap (2026-07-25)  
**Owner:** Knowsia Operations and Engineering  
**Scope:** Zoom-powered live learning operations; this document extends Documents 1-13.

## 1. Operating Model

Knowsia controls the learning journey; Zoom provides the live classroom. Knowsia remains the system of record for enrolment, payment eligibility, schedules, personal access, attendance, materials, recordings, follow-up, completion, certificates, and learning analytics. Zoom remains responsible for video, audio, screen sharing, breakout rooms, waiting rooms, and recording capture.

The platform stays a modular monolith. Do not introduce microservices for this scope. Provider-specific code belongs behind a live-session provider adapter so Microsoft Teams or Google Meet can be added later without changing learning rules.

**Recorded exception (2026-08-13), not yet exercised:** a self-hosted WebRTC classroom ("Knowsia Live") cannot run on Vercel — no UDP, no long-lived process, no persistent WebSocket on the current plan, function time limits. If it is ever built it requires exactly **one** additional always-on deployable, and the module boundary rule holds across that process boundary (it writes through `liveSessionsService` on a shared secret, never to tables directly — the same trust shape as the `'system'` tier in `modules/agent-tools/registry.ts`). This is a single named exception, not a precedent for splitting the monolith. It is **not being built** — see `Coding Docs/18_Knowsia_Live_RTC.md` §1 for the decision and §3.3 for why one deployable rather than the six the source plan proposed. Zoom remains the provider.

## 2. Source of Truth

`Course -> Batch -> LiveSession` is the authoritative hierarchy.

- `Course` defines the product and learning outcomes.
- `Batch` is the enrolment, commercial, and scheduling template. It holds default tutor, default Zoom configuration, payment/access rules, and reminder policy.
- `LiveSession` is one actual class occurrence. It owns the scheduled start/end time in `Africa/Accra`, tutor, provider meeting reference, agenda, materials, session status, attendance rules, reminders, recording policy, and follow-up state.

Existing batch-level `zoom_meeting_id`, `zoom_registrants`, and `attendance` remain operational while the LiveSession module is introduced. New sessions should be created from a batch schedule; historical attendance must remain readable.

## 3. Module Boundaries

```text
app/ -> modules/live-sessions/service.ts -> repository.ts -> lib/supabase
                              |
                              +-> modules/attendance (finalised attendance only)
                              +-> modules/communications (approved reminders only)
                              +-> modules/certificates (eligibility input only)
                              +-> lib/zoom (provider adapter)
```

`modules/live-sessions` owns session lifecycle, eligibility decisions, session-level provider references, materials metadata, reminders, access overrides, attendance review queue, recordings metadata, and audit events. It must not directly change payment status, registration status, certificates, or grades.

## 4. Core Entities

| Entity | Purpose | Key controls |
| --- | --- | --- |
| `live_sessions` | One scheduled learning occurrence for a batch | Status workflow; `Africa/Accra` timestamps; no hard delete after publishing |
| `live_session_tutors` | Tutor and substitute assignments | Tutor sees only assigned sessions; substitution reason required |
| `live_session_access` | Per-registration eligibility and provider join reference | Paid/approved gate; overrides record actor, reason, and expiry |
| `session_materials` | Agenda, slides, readings | Link or R2-backed file upload (exactly one); enrolled-role access only. **No version history** — superseded 2026-08-04, see Document 16 Phase 5 |
| `assignments` / `assignment_submissions` | Coursework set by a tutor/admin, and one current submission per Registration | **New scope 2026-08-04**, added at founder request against PRD §9's "not an LMS" exclusion — see Document 16 Phase 5 before touching |
| `attendance_exceptions` | Learner technical issue, excused absence, or manual correction request | Tutor/admin decision and immutable review evidence |
| `session_recordings` | Provider recording reference, consent, release, and retention metadata | Tutor approval before release; no raw provider credentials |
| `session_audit_log` | Critical lifecycle evidence | Append-only application audit for access, reschedule, override, attendance review, and recording release |

## 5. Session Lifecycle

`Draft -> Scheduled -> Registration Open -> Ready -> Live -> Completed -> Attendance Under Review -> Reviewed -> Archived`

`Cancelled` and `Rescheduled` are terminal outcomes for the original occurrence. A reschedule creates or links the replacement session and preserves the reason, actor, notification evidence, and affected registrations.

### Access and reminder workflow

1. Admin publishes a session created from a batch template.
2. Eligible learners are registered with Zoom and receive a stored personal join reference.
3. Knowsia sends approved reminders at configurable defaults: three days, 24 hours, one hour, and 15 minutes before start.
4. The student portal shows Join for the whole of an upcoming or in-progress session and explains unavailable access. Founder direction 2026-08-11 (after a live class where the link never appeared): the link disappears only once the session's duration has ended — there is no pre-start window any more — with a 60-minute grace after the scheduled end so a class that overruns keeps its link.
5. Zoom participation data is synced after the class, matched to registered learners, and placed under review.
6. Tutor/admin reviews exceptions, then locks the attendance outcome used by completion and certificate eligibility.

## 6. Role Responsibilities

| Role | Responsibilities | Cannot do |
| --- | --- | --- |
| Admin | Publish, reschedule, override access with reason, approve final exceptions and recording policy | Expose host links to learners without an audit event |
| Tutor | Host assigned session, upload materials, flag learners, approve proposed attendance exceptions, request recording release | View payment details or finalise certificates |
| Student | View own sessions, join eligible sessions, access released content, request a technical exception, submit assigned work (added 2026-08-04) | View another learner's link, attendance, materials, or submitted work |
| Management | Read operational and cohort analytics | Change attendance or access records |
| AI assistant | Draft summaries, reminders, catch-up tasks, and risk lists | Finalise attendance, grades, access overrides, or certificates |

## 7. Security, Privacy, and Audit Controls

- Use personal Zoom registrant links, never broadly shared learner links.
- Keep Zoom host URLs and credentials server-side; tutors receive a scoped host action only.
- Payment/approval eligibility gates every learner Join action. Admin overrides require a reason and expiry.
- Recording requires an explicit consent and retention policy. Release only to enrolled learners after tutor/admin approval.
- Lock reviewed attendance; later changes require an exception record with actor, reason, prior value, new value, and timestamp.
- Apply least privilege and RLS to all new tables. Sensitive actions must produce `session_audit_log` evidence.

## 8. Student and Tutor Experience

Student portal additions: Next Class card, Ghana-time countdown, protected Join button, preparation material, calendar download, session history, released recordings, catch-up tasks, support request, attendance percentage, and progress.

Tutor workspace additions: Today and upcoming sessions, host action, roster, agenda/materials, attendance review queue, late/no-show flags, learner follow-ups, substitute handover, recording release, and post-session completion checklist. **Superseded 2026-07-27** by `16_Tutor_Operations.md` as the source of truth for what's actually shipped (today/upcoming sessions, roster, attendance visibility, certificate eligibility) versus what's still future work (materials, no-show flagging, follow-ups, substitute handover, recording release) — this list was written assuming the tutor stayed inside the staff auth system, which is no longer the model (see Document 16).

## 9. Delivery Roadmap

1. **Foundation:** LiveSession schema, session generator from batch schedule, statuses, tutor assignment, Zoom meeting linkage, audit log, and student/tutor read models.
2. **Reliability:** Eligibility gate, personal links, reminder orchestration, calendar files, rescheduling, attendance reconciliation, and exception review.
3. **Learning value:** Materials, recordings metadata, tutor-approved AI summaries, catch-up tasks, and support requests.
4. **Intelligence:** At-risk learner signals, tutor insight, configurable completion rules, and executive reporting.

## Foundation implementation status (2026-07-25)

The first foundation slice is implemented in the application source: `live_sessions` and `live_session_audit_log`, status-transition enforcement, admin scheduling/control centre, and tutor-scoped session visibility. The migration has not yet been applied to production. It deliberately does not create or dispatch session-level Zoom meetings, alter existing batch Zoom links, send reminders, or change attendance records.
## 10. Acceptance Criteria

- A batch schedule can generate one immutable record per planned class occurrence.
- A student sees only their eligible upcoming session and never a host link.
- A tutor can operate only assigned sessions and cannot view payment data.
- Re-running provider sync or reminder jobs is idempotent.
- Attendance exceptions have a human reviewer, a reason, and audit evidence before they affect completion.
- Recording release, access override, cancellation, and reschedule actions are auditable.
- AI output is clearly draft until a responsible human approves it.

## 11. Decisions to Confirm Before Build

1. Use one Zoom meeting per LiveSession (recommended) or a recurring batch meeting during the transition.
2. Set the attendance threshold, reminder schedule, and recording retention period. (Join window settled 2026-08-11 — no pre-start gate, link live until scheduled end + 60 minutes; see Section 5, step 4.)
3. Decide whether technical-support requests become a dedicated support module or remain a communications workflow initially.
4. Confirm the first course/batch to pilot before enabling the model globally.