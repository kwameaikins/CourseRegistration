# 26 — Knowsia LMS: one service for live classes and self-paced learning

*Founder direction, 2026-09-20: "build the LMS as an independent API, deployed separately like M4.
It should have both the live session and the self-learning. Plan it as Apple would plan and
design it." This document is the plan and, once building starts, the record. It builds on
Doc 21 (phases 5 and 6 of the port, which this IS), Doc 22 §2 (the LMS named as its own service
beside Core, holding cohort operations and the one certificate registry) and Doc 20 (Learn on
`app.knowsia.com`). Read those first.*

---

## 0. The one-paragraph version

A student owns courses. Some of them are taught live by a person on a calendar, some are watched
at their own pace, and after the live one ends its recordings are the self-paced version of the
same course. Today those are two products in two codebases with two logins, two portals, two
certificate registries and no shared idea of progress. **Knowsia LMS is one service that owns
the course, however it is delivered**: the cohort, its sessions, the Zoom room, who came, the
lessons, the video, the progress, the assignment, the certificate. It runs as its own deployable
(`knowsia-lms`, Railway, the M4 pattern), the browser reaches it through the same proxy with the
same token, the other services reach it through pinned doors, and the Registration app's
13,000 lines of live-teaching TypeScript are retired into it in four releases, each observed
working before the next begins. Nothing about money moves: a seat is still sold by Registration
and priced by Core.

---

## 1. What the student experiences (design first, tables second)

**One shelf, called Learn.** DESIGN.md §4 already fixes it: *Learn is what you have, Explore is
what you could have.* A live cohort seat and a self-paced course sit on the same shelf as the
same kind of thing — a course, with a state. The student never learns which system serves it.

**The course has a delivery, not a category.** *Financial Reporting — November cohort* and
*Financial Reporting — self-paced* are one course. The cohort is a way of taking it. When the
cohort ends, its recordings ARE the self-paced course, in the same sections, and whether the
seat included them is an entitlement (§5, decision 1), never a second product.

**Home says the one thing.** DESIGN.md §2: on Home the thing that expires soonest wins, and a
class starting today outranks everything. The companion already orders candidates
server-side; the LMS supplies a `class` candidate ("Your Financial Reporting class starts in
40 minutes") and Home shows one button: **Join**.

**The classroom is one page.** For a live course the course page becomes the classroom:
- the next session at size, with a countdown and ONE primary action — **Join** from fifteen
  minutes before until sixty after; outside that window the same place says *Next: Wednesday
  18:00* with **Add to calendar**;
- under it, in this order: this session's agenda and materials, the assignment due, then the
  past sessions as a list (recording once released, materials, whether you were there);
- attendance as a sentence a person would say — *You were at 9 of 12 sessions* — never a table
  of minutes; the minutes stay a click down (DESIGN.md §3, defer don't delete);
- the tutor's name and photo, the WhatsApp group, the resources folder, each one quiet line;
- nothing rendered empty: no cohort schedule yet → *Sessions appear here once the timetable is
  set*, not a blank list (§1).

**Joining is one tap and never a copied link.** The personal Zoom link is minted server-side
when the seat is granted and handed to the browser only inside the join window; the email
still carries it for the phone-only student, as today.

**The tutor is a person with a role, not a portal.** Doc 22 puts RBAC inside Identity. A tutor
signs in to the study app like anyone else (`m1_users.role = tutor` already exists) and sees a
`Teach` space: today's session, the roster (names only — BR-33, no money on a tutor's screen),
attendance with *raise a correction*, materials, assignments to mark, who is eligible for a
certificate. The PIN-only tutor portal retires (§5, decision 2).

**The founder's admin follows the students-page rules** (CLAUDE.md, "Admin students"): a cohort
is scheduled as a sentence you read before you click — *Financial Reporting runs Monday,
Wednesday and Friday 18:00–20:00 from 6 October to 14 November: 18 sessions on Zoom, 30
seats* — the sessions are generated from it and shown, the strip's figures are the filters
(*Running · Starting this month · Seats left · Awaiting a tutor*), the founder's words never a
status key, no success toast, 200 ms motion off under reduced-motion, 375 px.

**What is deliberately not designed here:** an in-house video room (Zoom stays the room), a
chat, a forum, gamification. Each is a product decision and none is needed for the two halves
to become one.

---

## 2. The service

```
knowsia-lms      FastAPI · modules/knowsia-lms/ · Railway service "knowsia-lms"
                 own Dockerfile (python:3.12-slim + reportlab; no torch)
                 start: alembic upgrade head && uvicorn   (version table m2_alembic_version)
                 /health, /ready (DB SELECT 1)            healthcheck /ready, 300 s
                 same Postgres as knowsia-api (DATABASE_URL by reference, as M4)
```

**Tables.** Every `m2_` table moves with it — the 26 that exist and the ones §3 adds. The
Alembic history CONTINUES: `m2_alembic_version` is the same table, revision 013 is the head on
the day the service is born, 014 is the first revision written in the new repo. Rule 3 holds:
the LMS never touches another module's tables, and nothing else touches `m2_`.

**Doors, three kinds — the M4 precedent plus one.**
1. *Browser* — `/api/v1/courses`, `/lessons`, `/sections`, `/learning`, `/certificates`,
   `/certifications`, `/cpd`, `/cohorts`, `/classes`, `/teach`, `/admin/courses`,
   `/admin/cohorts`, `/admin/instructors`, `/admin/certificates`. The Next.js proxy's
   prefix→host map (`frontend/app/api/v1/[...path]/route.ts`, `SERVICES`) sends these to
   `KNOWSIA_LMS_URL`; the JWT is RS256 and the LMS verifies it with `JWT_PUBLIC_KEY` exactly as
   M4 does, so `require_student` / `require_admin` / `check_trial_access` are the same code.
   The refresh path stays on `auth` (knowsia-api). **This is the one way the LMS differs from
   M4**: M4 is server-to-server only; the LMS is a browser-facing service, which is why the
   proxy map exists.
2. *Service* — `/api/v1/service/lms/*` with `X-Service-Key`, for knowsia-api, the Registration
   app and Knovidia. Contract-pinned (`tests/contracts`), regenerated into
   `shared/contracts/lms-api.v1.json` and copied to this repo's `Coding Docs/contracts/`.
3. *Webhooks* — `/api/v1/lms/webhooks/zoom` (Zoom's secret-token verification),
   `/api/v1/lms/webhooks/bunny` later if needed.

**The seam, counted.** Every in-process call across the M2 boundary today becomes a door, and
the number is small because M2 was written to the module rules:

| Direction | Today (index.py call) | Becomes |
|---|---|---|
| knowsia-api → LMS | `resume_candidates_internal` (companion), `course_kpis_internal` (KPIs), `learning_export_internal` + `scrub_certificates_internal` (Core identity export / erasure), `enrol_user_internal` + `get_cpd_hours_internal` (Core organisations), `unanswered_qna_internal` (support) | 7 doors on the LMS, called through `app/core/http_client.lms_client` (`ServiceClient`, `KNOWSIA_LMS_URL`, `SERVICE_API_KEY`); every caller already handles "unavailable" as a 503 or an empty candidate |
| LMS → knowsia-api | M1: `get_user_display`, `find_or_create_registration_user`, user-by-participant; M3: `get_questions_by_ids`, `get_topic_question_bank`, `submit_attempt`, `get_published_topic_counts`; M7: `get_syllabus_outcomes`, `get_approved_topics`, `get_paper_documents`, `log_model_call`, `record_failed_event`; M6: `list_lessons`, `generate_lesson`, `check_lesson_content`; Core: `store_file`, `delete_file`, `send_message`, `record_audit` | 19 doors on knowsia-api under `/api/v1/service/{auth,questions,admin,analytics,files,messages,audit}`, called through the LMS's own `ServiceClient`. A quiz answer is still an M3 attempt (the door is `submit_attempt`); a material is still a Core file; an email is still a Core message |
| LMS → M4 | `m4_client.post("/service/ai/ask")` for the lesson tutor | unchanged, the LMS has its own `m4_client` |
| LMS → outside | Bunny Stream, Zoom, the certificate registry (until R3) | its own clients; Zoom is a new Python client (§3) |

**The three authoring agents move with the LMS** (curriculum architect, lesson composer, script
writer): they write `m2_` rows and read the knowledge side through the M7/M6/M3 doors above.
Their model calls go through the LMS's own copy of the routing in `core/llm` and are metered
into `m7_model_calls` through the `log_model_call` door, so `/admin/costs` keeps seeing them.
(Alternative rejected: leaving the agents in knowsia-api and giving the LMS write doors — that
puts a second author of `m2_` rows outside the module that owns them.)

**What does NOT move.** Entitlement to the study product (`_effective_tier`, trials, plans,
credits) stays in M1 — the LMS asks the token's `tier` claim, as every gate does. Money stays in
Core: a seat is a `cohort.<course>.<cohort>` SKU (Release 1 of Phase 4), a payment is a
`core_payments` row, and the LMS is told a seat was paid through a door, never by reading a
ledger. The question bank, the tutor, marking and analytics stay where they are. Identity stays
in Core; a tutor is a role on it.

**Scheduler.** The LMS runs its own (`app/core/scheduler.py`, the same `_every` / `_daily`
helpers): scheduled publishing (every 5 min), certificate registry retry (hourly, until R3
makes it moot), class reminders (every 5 min, 24 h and 2 h before a session), the nightly
attendance reconciliation (21:00 UTC — Zoom's pull as the safety net under the webhooks), the
post-cohort Zoom revocation (2 days after the end), the daily certificate issuance for cohorts
that ended yesterday (BR-46), the access-grant sweep. Each job is idempotent and each is off
until its setting is set, the lifecycle-email precedent.

---

## 3. The live half — what is built, and the rules that carry it

The self-paced half moves as it is. The live half is the port of the Registration app's
`courses`, `live-sessions`, `attendance`, `tutors`, `assignments`, `feedback`, `certificates`,
`access-grants` and the live parts of `portal` — about 13,000 lines of TypeScript and 7,000 of
tests whose business rules (BR-03, BR-07, BR-33, BR-46 and the rest) are carried across as
assertions, not just behaviour (Doc 21 §5).

**Tables** (extending the stubs platform already has; every one `m2_`):
- `m2_cohorts` — gains `external_ref` (Registration's `batches.id`, UNIQUE), `timezone`
  (default `Africa/Accra`), `start_time`, `end_time`, `meeting_days`, `zoom_meeting_id`,
  `zoom_join_url`, `whatsapp_group_url`, `resources_url`, `tutor_user_id`, `capacity`,
  `is_free`, `is_unlisted`, the reminder switches, `zoom_access_revoked_at`.
- `m2_cohort_sessions` — gains `ends_at`, `agenda`, `learning_outcomes`, `status`
  (draft → scheduled → ready → live → completed | cancelled | rescheduled), `status_reason`,
  `zoom_meeting_id`, `tutor_user_id`, `recording_lesson_id`; UNIQUE (cohort_id, starts_at).
- `m2_cohort_members` — gains `external_ref` (Registration's `registration.id`),
  `zoom_registrant_id`, `zoom_join_url`, `access_until` (the seat's clock), `seat_source`
  (`paid` | `free` | `grant` | `corporate`).
- `m2_session_attendance` (replaces the per-session boolean) — session_id, member_id,
  join_at, leave_at, minutes, session_minutes, `source` (`zoom_webhook` | `zoom_sync` |
  `name_match` | `manual`), UNIQUE (session_id, member_id); `m2_attendance_exceptions` for the
  tutor's corrections and the admin's review.
- `m2_access_grants` — the time-boxed access on an unsettled balance, append-only (a longer
  grant is a new row), reason and note required, `granted_by` null = automatic.
- `m2_cohort_feedback` — the post-course form (ratings, NPS, testimonial choice); a
  testimonial the person allowed is forwarded to Core as a report when Core gains one.
- `m2_assignments` / `m2_assignment_submissions` — gain files through Core Files and the
  tutor's review fields.
- `m2_course_certificates` — becomes the registry (R3): `certificate_number` NOT NULL after
  the migration, `serial` per (course_code, year), `source` (`cohort` | `self_paced` |
  `manual`), `external_ref` for Registration's rows.
- `m2_lesson_materials` gains `cohort_id` / `session_id` scope (a course library that every
  cohort sees, or one cohort's, or one session's — the three scopes that exist today).

**Rules, each with a test:**
- **Sessions are generated from the schedule by a pure function**, one per meeting day between
  the dates, capped, upserted on (cohort, starts_at) — the port of `schedule.ts`. Editing the
  timetable regenerates unstarted sessions and leaves started ones alone.
- **The Zoom room is the cohort's, created once**; a personal join link is minted per member
  when the seat is granted (registrant), re-minted on transfer, denied on revocation. Zoom is
  reached through one client (`services/zoom.py`, server-to-server OAuth, token cached), never
  from a router. **Attendance is pushed and pulled**: `meeting.participant_joined` /
  `_left` webhooks write `m2_session_attendance` as they arrive (source `zoom_webhook`); the
  nightly reconciliation pulls the participants report and fills what the webhook missed
  (`zoom_sync`, then `name_match` for a participant who joined under another name); a person's
  correction outranks both. The 30 % threshold is reported, never a gate — the rule as it is.
- **Access is an entitlement, computed on read**: a member sees the classroom while
  `seat paid | free | grant not expired | corporate` and until `access_until`; the join link
  is served only inside the session window; the sweep warns three days before a grant lapses
  and withdraws the Zoom registrant when it does.
- **Every message goes through Core Communications** with a key that names it
  (`class_reminder:<member>:<session>:24h`, `cohort_welcome:<member>`, `zoom_link:<member>`),
  so a reminder is never sent twice and never sent by two systems during the dual-run.
- **Recordings are the bridge.** Zoom's `recording.completed` webhook (or the nightly pull)
  fetches the cloud recording, uploads it to Bunny Stream from URL, and attaches it as a
  lesson in the course's *Recordings* section with `recording_lesson_id` on the session.
  Whether a cohort member may watch it is decision 1 in §5; the mechanism is the same
  enrolment `expires_at` the self-paced course uses. Until decided, the founder's rule
  stands: a live seat does not include recordings.
- **Certificates: one registry, one numbering** (Doc 22 §2, the founder's placement). In R3
  the LMS mints `KNS-<CODE>-<YEAR>-<NNNN>`, per course code per year, with the serial floor
  and the three-retry unique guard as today; BR-46 eligibility (participation = attended > 0
  OR feedback OR a submission; a paid cohort also needs the seat paid) and the daily issuance
  move with it; the PDF is rendered by reportlab to the same layout (signatories, QR, verify
  footer); `/verify/<number>` on the Registration host reads the LMS and **answers
  byte-identically for all 312 issued numbers** — that is Doc 21's first inviolable, and R3's
  exit test replays every one.
- **A tutor sees names and never money** (BR-33): the roster door returns name, email, phone
  and nothing from Core's ledger.

**Tenancy of a cohort seat.** A seat is sold by Registration (its `registrations` row) and
priced by Core; the LMS learns of it through `POST /api/v1/service/lms/cohorts/{ref}/members`
(idempotent on the registration id) and of its withdrawal through `DELETE`. Registration's
`batches` are mirrored into `m2_cohorts` by `external_ref` (R1) exactly as they were mirrored
into Core SKUs (Phase 4 R1) — best effort, the seam pattern this repo already runs.

---

## 4. Releases — one cutover in flight at a time, 24 hours watched between

| # | Release | What lands | Exit — observed, not asserted |
|---|---|---|---|
| **R0** | **The service** (the lift) | `modules/knowsia-lms/` created from `app/lms/` + `migrations/lms/` + `tests/lms/` + the 3 agents + the admin course/instructor routers, unchanged in behaviour; `m2_alembic_version` continues; the 7 + 19 doors and both `ServiceClient`s; the proxy prefix map; `KNOWSIA_LMS_URL` on Vercel and knowsia-api; Registration's `KNOWSIA_APP_API_URL` LMS calls repointed (`KNOWSIA_LMS_API_URL`); `app/lms` deleted from knowsia-api; contracts pinned both ways | Railway `knowsia-lms` SUCCESS, `/ready` 200, `m2_alembic_version = 013` read back from the new service; the study frontend serves courses, a lesson, My learning, a certificate PDF and `/verify` from the LMS host; 177 tests green in the new repo, knowsia-api's suite green without `app/lms`; **nothing a student can see changed** |
| **R1** | **The classroom** | Cohorts real (§3 tables, the schedule generator, Zoom client, join links, webhook + nightly attendance, materials by scope, reminders through Core, access grants); the classroom page in Learn; Home's `class` candidate; `/admin/cohorts` (the sentence); Registration mirrors batches → cohorts and grants seats through the door on the paid transition (beside its own Zoom registration, which keeps running) | **Dual-run on one real cohort for its whole run**: the LMS's attendance equals Registration's to the person for every session; every reminder the LMS would send is logged `skipped/dual_run` and matches Registration's log one-for-one; the join link the LMS minted is the one Registration minted (same registrant) |
| **R2** | **Teach** | The tutor role in the study app; the Teach space (today's session, roster, attendance + corrections, materials, assignments and marking, eligibility); tutors linked as Core identities; the tutor PIN portal redirects to the study app | A real tutor runs one session's paperwork (attendance correction, a material, a graded submission) from the study app and the Registration side shows the same facts through the mirror |
| **R3** | **One registry** | Numbering, eligibility, daily issuance and the PDF in the LMS; the 312 rows migrated with their numbers; Registration's `/verify` reads the LMS; Registration's issue door forwards to the LMS; the LMS's own registry client retired | **Replay**: every number Registration issued or would issue (dry-run over every ended batch) the LMS issues identically; `/verify/<number>` byte-identical for all 312; a new cohort's first certificate minted by the LMS alone |
| **R4** | **Cutover and delete** | Registration's live modules deleted (courses' Zoom/schedule, live-sessions, attendance, tutors, assignments, feedback, certificates, access-grants, the portal's live panels, the four crons); the student portal's Live Courses and Certificates hand off to Learn; `zoom_registrants`, `attendance`, `live_sessions` … dropped after 30 days read-only | The TypeScript is gone (Doc 21 §3 step 5); one cohort starts and finishes with no Registration-side live code in the path |

**R0 released 2026-09-20** — Railway service `knowsia-lms` (`6bce36ab`, `https://knowsia-lms-production.up.railway.app`),
`m2_alembic_version = 014_admin_actions` read back; knowsia-api `164bae5e` without `app/lms`; both frontends and
this app pointed at it; the exit criteria in §4 met (the LMS's logs show the proxy's, the catalogue page's and
`/verify`'s reads landing on it; 1,320 + 174 tests; nothing student-visible changed). The migration-runner race
named in the plan fired once, from the monolith's side (`a70e6690`), and step 5 closed it. KnowsiaApp
PLAN.md §3.25 is the build record.

**R1 released 2026-09-21** — the classroom: `knowsia-lms` `de9dd807` (migration 015, `m2_alembic_version = 015_classroom`),
knowsia-api `0e64b113` (the companion's `class` candidate), both frontends, this app `a9546cb` (the batch and seat mirrors,
hooked into createBatch / updateBatch, the paid transition, the free confirmation, transfer, write-off and every
access grant; `scripts/sync-cohorts-to-lms.mjs`). `LMS_DUAL_RUN=true` on the LMS: it records reminders it would
have sent and registers nobody with Zoom. **Zoom is off in the LMS until the five `ZOOM_*` variables are set on
the `knowsia-lms` service and the Event Subscription points at `/api/v1/lms/webhooks/zoom`** — the founder's
switches, listed in KnowsiaApp PLAN.md §3.26 with the one-cohort watch that is R1's exit criterion.

R0 is a refactor and is what "deploy separately like M4" means; it can ship this week. R1 is the
product. R2 and R3 are the two things with people's names on them (tutors, certificates) and
each has a replay test rather than a judgement. R4 is deletion, which is the point.

**Order of work inside R0, because the risk is in the seam:** doors on knowsia-api first (with
knowsia-api still serving the LMS in-process, the doors are additive and testable); then the
LMS repo with its clients pointed at those doors; then the proxy flip behind
`KNOWSIA_LMS_URL` (unset → the old in-process routes still answer); then delete `app/lms`.
A rollback at any step is unsetting one variable.

---

## 5. Decisions for the founder — TAKEN 2026-09-20

The founder confirmed the recommendation on 1–4 the same day; 5–7 proceed on the recommendation.
Recorded here so nothing below is re-litigated in code: recordings are in the seat for 90 days;
tutors sign in to the study app; the registry moves in R3 behind the replay; cohorts are created in
Registration until R4.

1. **Recordings.** *Recommended:* a recording is released to a cohort member for 90 days after
   the cohort ends, as part of the seat, and the self-paced course of the same title is a
   separate SKU for anyone else. The current rule ("never automatic") stays until this is
   decided. *This is a pricing decision, so it is yours.*
2. **Tutors sign in to the study app** with the `tutor` role, their PIN portal retiring in R2.
   *Recommended.* The alternative — keeping a second login — keeps the second product.
3. **The certificate registry moves to the LMS** in R3 (Doc 22 §2 already says so).
   *Recommended*, with the replay test as the condition.
4. **Cohorts are created in Registration until R4** and mirrored into the LMS; the LMS admin
   edits the classroom (sessions, tutor, materials), never the sellable batch. *Recommended*,
   because the register page and the SKU need the batch where the money is. After R4 the
   founder schedules a cohort in the LMS and Registration reads it.
5. **Zoom stays the room**; the founder enables the event subscriptions
   (`meeting.participant_joined`, `_left`, `recording.completed`) on the Zoom app and pastes
   the secret token into Railway. Webhooks are an improvement over the nightly pull, not a
   dependency — R1 works on the pull alone.
6. **The three authoring agents move with the LMS** (§2). *Recommended.*
7. **Timezone per cohort**, default `Africa/Accra`, which is what everything assumes today.

---

## 6. What is deliberately NOT here

An in-house video room or chat; a forum; badges; a mobile app; tutor availability or
timetabling (no table exists today and no rule asks for one); the news pipeline; anything about
money, which stays in Core and Registration; a second frontend — the LMS is served by the study
app's Next.js, and the Registration app's portal hands off to it.

---

## 7. Where this leaves Doc 21

Phases 5 (programme operations) and 6 (certificates) of the port are done by R1–R3 of this
plan, in a new service rather than inside `knowsia-api` — Doc 22 §2's placement, not Doc 21's,
and the reason is the one Doc 22 gives: the LMS scales differently (video, live traffic in
bursts at class time) and must not take Core or the question bank down with it. Doc 21's method
is unchanged: port, migrate, dual-run, cut over, delete.
