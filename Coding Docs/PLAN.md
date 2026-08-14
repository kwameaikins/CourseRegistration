# PLAN.md — Live Implementation Tracker

This is the working checklist for the 5-week build. Check items off as they are completed.
Full rationale for sequencing lives in `/docs/10_Implementation_Plan.md` — this file is the
actionable version of that document, meant to be edited as work happens, not just read.

**Update the "Current status" section in `CLAUDE.md` whenever you update this file.**

---

## Phase 1 - Task 1 — Foundation

*Riskiest assumption tested: does the schema + RLS + auth foundation actually work as designed?*

- [x] Repository scaffolded per `/docs/02_Technical_Architecture.md`, Section 3
- [x] Supabase project created and CLI-linked
- [x] Full migrations written and applied (`202607170001_foundation.sql`, `202607180002_whatsapp.sql`, `202607180003_fix_registration_confirmation_trigger.sql`)
- [x] RLS policies written (same migration; includes `public_insert_payment` addition — see Doc 4, EC-07)
- [x] PostgREST grants written (same migration)
- [ ] First real Admin account created and can log in *(active Admin row created; post-link dashboard smoke test pending)*
- [x] Course Control Panel screen built (F1.02) — Admin can create a Course and Batch
- [x] Staff User Management screen built (US-A05)
- [ ] Remaining 5 staff accounts created *(via the Users screen once live)*
- [x] Middleware route protection implemented (`/docs/06_Security_and_Authentication.md`, Section 3)
- [x] Google OAuth application flow implemented (`/auth/callback`, PKCE code exchange, safe redirect validation)
- [x] Google Cloud OAuth client + Supabase Google provider configured; live Google authentication verified
- [ ] Manual smoke test: all 6 roles log in and land on correct default page
- [ ] **RLS test cases T-RLS-01 through T-RLS-07 run and passing** — database SQL suite covers T-RLS-01/02/04/05/06/07 (T-RLS-06 added 2026-07-26, a real anon INSERT not just a grant check); T-RLS-03 (marketing's API-shaped field-stripping) now has direct Vitest coverage (`tests/unit/registrations-service.test.ts`). Still needs a live pass against the deployed app/Supabase project for final sign-off.

**Week 1 gate:** ⬜ PASS — all 6 staff can log in with correct role routing; RLS tests pass.

---

## Task 2 — Registration, Payments, Paystack

*Riskiest assumption tested: does the full Paystack webhook → payment → confirmation chain work end-to-end?*

- [x] Public Registration Form built (F1.01)
- [x] `POST /api/registrations` implemented, including BR-01, BR-02, BR-03
- [x] Payment Tracking screen built (F1.04) — manual bank transfer flow
- [x] `PATCH /api/payments/[id]` implemented
- [x] Paystack checkout initiation implemented (`components/PaystackCheckout.tsx`), `metadata.registration_id` present in the setup config — confirm in live payload
- [x] Paystack webhook handler implemented — signature validation (BR-13)
- [x] Paystack webhook handler implemented — idempotency check (BR-14)
- [ ] **Live Paystack test-mode payment run end-to-end (T-INT-01, T-INT-02)** *(external — needs Paystack keys + deployed URL)*
- [ ] Any issues from the live test fixed
- [x] Webhook idempotency unit-tested (T-BR14-01 logic — `tests/unit/paystack-webhook-handler.test.ts`); repeat live once deployed

**⚠️ Week 2 gate — PIVOT-OR-PERSEVERE CHECKPOINT**
(`/docs/10_Implementation_Plan.md`, Section 4)

- [ ] Live Paystack payment updates the Registration correctly end-to-end

**If NOT passing by end of Week 2:** Pre-approved fallback — launch with 100% manual
payment verification (Finance marks all payments Paid manually, referencing the Paystack
dashboard). Automate the webhook as a fast-follow in Week 6. **Do not let this block Week 3.**

---

## Task 3 — Email Automation

*Dependency note: this week depends on Week 2's payment status changes existing to trigger confirmation emails.*

- [x] Resend account set up *(external — done 2026-07-19; send-only API key in `.env`, from-address `reg@knowsia.com`)*
- [x] Sending domain DNS verified *(external — done 2026-07-19; live test send from `reg@knowsia.com` to founder inbox returned 200, message id `7519e4ea-91eb-4614-b33e-384490fc4c19`)*
- [x] Email engine built (F1.06) — template rendering + `sendEmailOnce`
- [x] BR-07 reservation-before-send pattern implemented (log row inserted BEFORE Resend call)
- [x] Welcome email (E01) sending on registration
- [x] Payment Instruction email (E02) sending on registration
- [x] Reminder 1 (E03) sending on registration when Unpaid
- [x] Reminder 2 (E04) — 24h cron logic
- [x] Reminder 3 (E05) — 2 days before start date cron logic
- [x] Reminder 4 (E06) — morning of start date cron logic
- [x] Vercel Cron configured: `0 7 * * *` (`vercel.json`)
- [x] Payment Confirmation email (E07) sending on payment status → Paid
- [x] Reminder cancellation logic implemented (BR-08 — fresh status check at send time)
- [x] T-BR07 and T-BR08 test suite run and passing (unit level — `tests/unit/email-engine.test.ts`, `tests/unit/reminder-scheduler.test.ts`; DB-constraint level in `supabase/tests/database_test_suite.sql`)
- [ ] Cron re-run test: trigger `/api/cron/reminders` twice in succession, confirm zero duplicate sends (T-INT-05) *(live, once deployed)*

**Week 3 gate:** ⬜ PASS — all 7 Phase 1 email types sending correctly; deduplication confirmed under repeated execution.

### WhatsApp notifications (scope addition, approved 2026-07-18 — see Doc 4, EC-09)

- [x] `whatsapp_log` migration + per-batch WhatsApp toggle (`202607180002_whatsapp.sql`)
- [x] Meta Cloud API client with Ghana phone normalization (`lib/whatsapp/client.ts`)
- [x] `sendWhatsappOnce` engine — BR-07-style dedup, gates before reservation, graceful skip when unconfigured
- [x] Wired: welcome on registration, reminders in daily cron, confirmation on payment → Paid (manual + webhook)
- [x] Courses screen: "WhatsApp messages" toggle under Automation Settings
- [x] Unit tests (16) for normalization, dedup ordering, gating, template mapping
- [ ] *(external)* Meta Business account + WhatsApp Business phone number set up
- [ ] *(external)* Three templates created and approved in Meta Business Manager: `course_registration_welcome`, `course_payment_reminder`, `course_payment_confirmation` (parameter layout in the migration header)
- [ ] *(external)* `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` set in Vercel
- [ ] Live test: registration triggers WhatsApp welcome; duplicate cron run sends zero duplicates

### SMS notifications via Arkesel (scope addition, approved 2026-07-19 — see Doc 7, Section 8)

- [x] `sms_log` migration + per-batch SMS toggle (`202607190006_sms.sql`) — applied to linked project
- [x] Arkesel API client (`lib/arkesel/client.ts`), Ghana phone normalization shared with WhatsApp
- [x] `sendSmsOnce` engine — BR-07-style dedup, gates before reservation, graceful skip when unconfigured; bodies composed in code (kept under ~2 SMS segments)
- [x] Wired: welcome on registration, reminders in daily cron, confirmation on payment → Paid (manual + webhook)
- [x] Unit tests (12) for dedup ordering, gating, body composition (`tests/unit/sms-engine.test.ts`)
- [x] Courses screen: "SMS messages" toggle under Automation Settings
- [ ] *(external)* Arkesel account created; sender ID (e.g. "Knowsia") registered and approved
- [ ] *(external)* GHS credit purchased (~GHS 20 minimum; ~0.029/SMS) — first recurring cost, founder-accepted
- [ ] *(external)* `ARKESEL_API_KEY` + `ARKESEL_SENDER_ID` set in Vercel (and uncommented in local `.env`)
- [ ] Live test: registration triggers SMS welcome; duplicate cron run sends zero duplicate SMS

### Zoom attendance (scope addition, approved 2026-07-19 — Doc 7, Section 9)

- [x] Migration `202607190007_zoom_attendance.sql` (batches.zoom_meeting_id, zoom_registrants, attendance + RLS) — applied to linked project
- [x] Zoom S2S OAuth client (`lib/zoom/client.ts`) — token cache, registrant creation, participant reports
- [x] `modules/attendance` — ensureZoomRegistration on payment → Paid (manual + webhook), runAttendanceSync
- [x] `zoom_link` email sends the personal join link ({{zoom_link}} prefers it); default templates seeded
- [x] Cron `/api/cron/attendance` daily 21:00 UTC (`vercel.json`) — idempotent upserts
- [x] Courses screen: Zoom Meeting ID field per batch; Attendance screen (admin + management)
- [x] *(external)* Zoom Server-to-Server OAuth app created; `ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET` in Vercel — confirmed by founder 2026-07-20
- [ ] *(external)* Class meetings created in Zoom with Registration: Required; meeting IDs set on batches
- [ ] Live test: payment → personal link email; after a session, attendance rows appear

### Admin messaging editor + AI assistant (scope addition, approved 2026-07-19 — Doc 7, Section 10)

- [x] Messaging screen (admin): write/edit per-course templates for all 13 email types, active toggles
- [x] `/api/templates` GET/PUT (admin), upsert via RLS-enforced admin policy
- [x] Assistant screen (admin): Claude tool-runner over existing services (courses, batches, users, templates, dashboard)
- [x] *(external)* `ANTHROPIC_API_KEY` set in Vercel — confirmed by founder 2026-07-20
- [x] Write-capable actions (2026-07-25, propose-then-confirm): `propose_discount`, `propose_installment_plan`, and `propose_transfer` let the model prepare a discount, payment plan, or batch transfer for a registration, but none of them execute anything — each only surfaces a confirmation card in the UI. The only path to a real write is the admin's own "Confirm & Execute" click, which calls `POST /api/assistant/execute-action` (a route the model has no access to) and delegates to the exact same service functions (`applyDiscount`, `setUpInstallmentPlanForRegistration`, `transferRegistration`) the manual screens use. Every executed action is logged to the new `staff_action_audit_log` table (migration `202607260029`, applied to production 2026-07-26).
- [x] Unified agentic OS (2026-07-26): `modules/agent-tools` is now the one shared tool registry every AI surface reads from and dispatches through — the Admin Assistant chat and the Vapi voice-tools endpoint (`app/api/voice/tools`) both source their tool lists from it, closing the gap where role/trust gating used to depend on which route you went through (several modules only gated at the route layer, not in `service.ts`). `modules/staff-actions` was folded into it and deleted. Added 5 new write-confirm actions (cancel/reschedule a live session, revoke a certificate, queue-and-send a campaign, update a lead, create a sales opportunity) plus read-only tools for every module that previously had none (campaigns, live sessions, waitlist, attendance, certificates, feedback, opportunities, message log). `staff_action_audit_log.action_type`'s CHECK constraint was dropped (migration `202607260030`) so a new write-confirm tool never needs a schema migration — adding one is just registering an object in `modules/agent-tools/registry.ts`.

### Post-course feedback (scope addition, approved 2026-07-19 — supersedes the F2.05 email-only plan)

- [x] Migration `202607190008_feedback.sql` (feedback table, 1-per-registration, RLS admin/management read) — applied to linked project
- [x] Public form `/feedback/<registration-uuid>` (token = unguessable Registration UUID; no login): 3 ratings, improvement text, testimonial consent, anonymity option, course interests
- [x] `post_training_thankyou` email dispatched by the daily 07:00 cron to Paid registrations of batches that ended yesterday ({{feedback_link}} placeholder; BR-07 dedup; certificate-for-feedback incentive in the seeded template)
- [x] Staff review screen `/course-feedback` (admin + management): response rate, average ratings, testimonials, course interests
- [x] DPA: erased participants' links go dark; anonymous comments hide the name; tutors have no feedback read access
- [x] Unit tests (7) — dispatch timing/dedup, duplicate submission, deleted-participant gate, rating validation
- [ ] Live test: end a batch (or set end_date to yesterday), run the cron, submit via the emailed link, confirm it appears on the review screen

### Agentic voice calls via Vapi (scope addition, approved 2026-07-19 — Doc 7, Section 11)

- [x] Migration `202607190009_voice_calls.sql` (call_log, one call per registration per type, RLS admin/finance/management) — applied to linked project
- [x] Vapi client (`lib/vapi/client.ts`) — outbound calls with schedulePlan (10:00 Ghana calling window), secret validation
- [x] `modules/voice` — candidate queries + dispatch for all 5 outbound types (payment_followup, bank_transfer_chase, no_show_recovery, feedback_voice, upsell), reserve-before-dial dedup, deleted-participant and bad-phone gates
- [x] Webhook `/api/webhooks/vapi` — end-of-call reports: transcript, summary, promised payment dates, bank references, human-followup flags; voice feedback writes into the feedback table
- [x] Tools `/api/voice/tools` — inbound/outbound agent tools: course catalog, SMS registration link, human-callback requests
- [x] Dispatch wired into the 07:00 cron; Calls review screen (admin, finance, management) with transcripts and follow-up queue
- [x] Unit tests (10) — window scheduling, reserve-before-dial, dedup, gates, webhook ingestion
- [ ] *(external)* Vapi account + Ghana caller ID + outbound assistant configured per Doc 7 §11.3 (system prompt + structuredData schema + server URLs)
- [ ] *(external)* `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_OUTBOUND_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET` in Vercel
- [ ] Pilot: one batch, payment_followup only (temporarily leave other assistants unconfigured), verify wire shapes end-to-end on the Calls screen, measure paid-conversion of called vs not-called

### Certificate system (scope addition, approved 2026-07-19 — replaces the Google Sheets + AppScript registry)

- [x] Migration `202607190010_certificates.sql` (registry table, one per registration for batch issues, RLS admin manage + management read) — applied to linked project
- [x] Numbering `KNS-<COURSECODE>-<YEAR>-<NNNN>` (founder-chosen prefix), serial per course per year, unique-constraint collision guard; custom numbers supported for legacy KNW backfill
- [x] PDF generated on demand with pdf-lib matching the Certificate of Competence design (purple border, orange name, QR code → verification URL); no file storage — download links work forever
- [x] Public verification page `/verify/<number>` (valid / revoked / not found) — QR on every certificate points here
- [x] Certificates screen (admin): batch issuance with auto-computed eligibility (Paid + feedback; attendance % shown for judgment, admin selects rows), manual issuance (incl. legacy backfill + optional email), registry list with PDF/verify/revoke
- [x] Delivery email with download link, verification link, and LinkedIn guidance
- [x] Unit tests (9) — numbering/serial continuation, legacy custom numbers, eligibility, batch issue + email, verification states, PDF magic-bytes smoke test
- [x] Handwritten signatures for Isaac Adjin Bonney and Stephen Kwame Aikins embedded (inlined base64 in `lib/certificates/signatures.ts`, bundle-safe on Vercel) — visual parity with the Canva original confirmed
- [x] DPA gap closed: `fn_soft_delete_participant` revokes + scrubs the erased participant's certificates (migration `202607200011`)
- [x] Backfill: all 101 legacy registry certificates imported (original KNW numbers, 1 revoked); verification live for all three states
- [x] Serials continue across prefixes AND respect the legacy AppScript counter as a floor (`courses.certificate_serial_floor` from the catalog CSV — e.g. next AI01 = KNS-AI01-2026-0067, next CA01 = KNS-CA01-2026-0021)

### Course/catalog hardening (system review, approved 2026-07-20)

- [x] Migration `202607200011` — courses carry certificate metadata (hours, description, CPD credit) + serial floor; `fn_soft_delete_participant` now revokes and scrubs the erased participant's certificates (DPA gap closed)
- [x] Default email templates auto-seed on course creation (insert-only, never overwrites edits) — the "new course silently sends no email" trap is closed
- [x] Course editing on the Courses screen (name + certificate fields; course code immutable — baked into cert numbers); `PATCH /api/courses/[id]`
- [x] Catalog imported: 10 new courses created from the founder's CSV (AI01–03, CA01–04, FR01–02, IA01), ESG1 updated; 90 default template rows seeded for the new courses
- [x] Batch certificate issuance prefills hours/description/CPD from the course
- [x] Course-code policy clarified: codes identify distinct course types within each family; AI01, AI02, AI03, and AI05 are all valid AI courses and remain available
- [x] Public `/verify` landing page (no certificate number in the URL) — was a 404; now offers a lookup form so an employer typing the bare URL can search
- [x] "View our courses → reg.knowsia.com/register" lead-gen line added to both `/verify` and `/verify/<number>` footers — turns every verification into a registration lead
- [x] Brand assets wired in: `app/icon.png` (favicon, from the icon-only mark), `public/knowsia-logo.png` (real lockup on the register/feedback/verify page headers via `components/KnowsiaHeader.tsx`), and a hosted-URL logo header on transactional + certificate delivery emails (new course templates and the certificate email; existing already-seeded template bodies were left untouched to avoid clobbering founder edits)
- [ ] Not yet used: remaining assets — shirt mockups, vertical/stacked logo variant (no current use case)
- [ ] Still pending from the review: batch capacity (max seats) + session-days schedule, dashboard attendance/feedback/certificate metrics

### Registration 360° view (system review item, approved 2026-07-20)

- [x] `GET /api/registrations/[id]` — aggregating read across every module that touches a Registration (participant, course/batch, payment, email/WhatsApp/SMS logs, Zoom registrant, attendance, feedback, certificates, voice calls); repository runs on the service-role client (several joined tables' own RLS is admin/management-only), with the *real* role-based shaping made explicit in `shapeRegistration360ForRole` (Document 5 Section 3 rules extended to every new module)
- [x] Role visibility: Admin sees everything; Finance sees payment audit fields + Calls (matches its existing `/calls` access) but no comms logs/attendance/feedback/certificates; Marketing sees Payment Status only (no audit fields) and no engagement sections; Tutor sees no payment section at all — sections the role can't see are omitted from the response entirely, not returned empty
- [x] "View" action added to the Registrations list opening `RegistrationDetailDialog` — participant, course, payment, a merged chronological message timeline (Email/WhatsApp/SMS badges), Zoom registration, attendance sessions, feedback ratings, certificates, and calls, each section only rendered when the API included it
- [x] Soft-deleted participants show a DPA-erasure notice instead of their (scrubbed) PII
- [x] Unit tests (6) — not-found, and role-shaping for admin/finance/marketing/tutor, deleted-participant flag
- [ ] Live test: open a real registration as each of admin/finance/marketing and confirm the visible sections match the rule above

---

## Task 4 — Dashboard, Compliance, Tutor View

- [x] Management Dashboard built (F1.08) + `GET /api/dashboard/summary`
- [x] Registration List screen built (F1.03) with role-based field filtering (`/docs/05_API_Contract.md`, Section 3)
- [x] **DPA consent checkbox enforcement implemented (BR-15) — client AND server side**
- [x] **Soft delete function implemented (`fn_soft_delete_participant`) — tested in `supabase/tests/database_test_suite.sql`**
- [x] **Hard delete function implemented with 30-day guard (`fn_hard_delete_participant`) — guard tested in same suite**
- [x] Participant Deletion UI built for Admin (Users screen, "Participant Data Deletion" panel)
- [x] My Courses (Tutor) screen built
- [ ] Tutor RLS filtering re-tested against the finished UI (T-RLS-01, T-RLS-02) *(needs live Supabase)*
- [x] `/api/health` endpoint created
- [ ] Uptime Robot monitor configured (5-min interval against `/api/health`) *(external)*
- [x] Sentry installed (manual config — wizard is interactive; `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation*.ts`)
- [x] Sentry `beforeSend` PII scrubbing implemented (`lib/sentry-scrub.ts`) — verify live with a test event

**Week 4 gate:** ⬜ PASS — all Phase 1 features functionally complete. DPA features present and tested.

> **No workaround exists for this gate.** If DPA features are at risk, cut a Should-Have
> feature elsewhere to protect them — see `/docs/10_Implementation_Plan.md`, Section 4.

---

## Task 5 — Testing, Fixes, Go-Live (Buffer Week)

- [ ] Full Test Specification run (`/docs/09_Test_Specification.md`) — all BR, integration, RLS test cases
  - [x] Unit level: 95 Vitest tests passing (`npm run test`) — BR-03/04/07/08/13/14/15/19 logic, webhook, email, WhatsApp and SMS engines, dashboard
  - [x] Database level: `supabase/tests/database_test_suite.sql` passed against the linked project; BR-06 repair is captured in migration `202607180003`
  - [ ] Live integration: T-INT-01…06 once deployed with real keys
- [x] Load test script written (`scripts/load-test-registrations.mjs`, `npm run load-test`) — 10 concurrent registrations with distinct emails against one batch, then 2 concurrent registrations with the same email, per Section 7, Document 9. Not yet run against a live deployed environment for sign-off — needs `BASE_URL`/`BATCH_ID` pointed at a real target and the founder's go/no-go on the results.
- [ ] Manual pre-launch checklist completed with founder + at least one staff member per role (`/docs/09_Test_Specification.md`, Section 6)
- [ ] All bugs from Days 21–23 fixed
- [ ] Exposed legacy Supabase service_role key rotated/disabled and local/server environment updated
- [x] Production deployment to Vercel (`reg.knowsia.com`; `/api/health` verified `status: ok`)
- [ ] **Paystack webhook URL updated to production domain (not a Preview URL)**
- [ ] Real Course + Batch data entered for the approaching intake (if not already done Week 1)
- [ ] **Final pre-launch review run** (`/docs/12_Agent_Prompt_Engineering_Guide.md`, Section 9)
- [ ] Go-live
- [ ] Sentry + Uptime Robot monitored closely for first 48 hours post-launch

**Taskgate — Definition of Done** (`/docs/10_Implementation_Plan.md`, Section 7):

- [ ] All 10 Phase 1 features passing their test cases
- [ ] All 19 business rules verified via test cases
- [ ] Ghana DPA features live, not deferred

- [ ] Real approaching course intake set up with real data
- [ ] All 6 staff have working accounts, completed pre-launch checklist
- [ ] Uptime Robot + Sentry live and confirmed receiving data
- [ ] Paystack webhook registered against production domain
- [ ] Zero open Sentry errors from the load test

---

## Phase 2 (Weeks 6–9) — Not started

Deferred until Phase 1 is stable in production. See `/docs/01_PRD.md`, Section 7.

- [ ] F2.01 — Class Reminder Email (24h)
- [ ] F2.02 — Class Reminder Email (2h)
- [ ] F2.03 — Zoom Link Distribution Email
- [ ] F2.04 — WhatsApp Group Invitation Email
- [ ] F2.05 — Post-Training Thank You Email
- [ ] F2.06 — Upsell/Cross-Sell Email
- [ ] F2.07 — Follow-Up and Sales Tracker
- [ ] F2.08 — Attendance Tracking

---

## Revenue OS Phase 2 add-ons (2026-07-25)

- [x] Lead assignment rules by source, admin-managed at `/leads/assignment-rules`
- [x] Campaign workspace with dry-run Queue, audience preview, and logged campaign members
- [x] AI follow-up suggestions grounded in real lead status, score, and history
- [x] Live email sending via Resend with per-channel toggles, separate Send action, 100-recipient cap, exact recipient count, and typed `SEND <count>` confirmation
- [x] Live SMS sending via Arkesel with the same per-channel toggle, separate Send action, 100-recipient cap, exact recipient count, and typed `SEND <count>` confirmation
- [ ] Live WhatsApp dispatch wiring; its setting remains disabled until Meta credentials and templates are ready

---

## Lead system hardening + automation (2026-07-26)

Migration `202607260031_leads_hardening.sql` (status/activity-type CHECK constraints). Closes
gaps found in a full review: unenforced status/source strings, an unvalidated PATCH route, no
dedup, no automatic Enrolled transition, no waitlist lead capture, and zero follow-up automation.

- [x] `LeadStatus`/`LeadSource` are now real enums end-to-end (added a terminal "Lost" status), enforced by a DB CHECK constraint and zod schemas on both create and update
- [x] `PATCH /api/leads/[id]` now validates against `updateLeadInputSchema` (previously accepted an unvalidated raw body)
- [x] Dedup on create: a second intake matching an existing lead's email merges into it (attaches a missing registration/participant id, only ever raises the score) instead of creating a disconnected duplicate
- [x] A lead now automatically transitions to `Enrolled` (with a score bump) the moment its linked registration's payment clears — wired non-blockingly into `runPaidTransitionSideEffects`, same posture as the existing opportunity-won sync
- [x] Waitlist joins now also capture a lead (previously only direct registrations did)
- [x] Follow-up automation: `runFollowUpDispatch` (bundled into the existing 07:00 `reminders` cron — Vercel Hobby's two-job cap was already fully used) emails each due lead's assigned staff member a templated nudge; `list_leads_due_for_follow_up` and the leads page's due-for-follow-up filter now share the same server-side query (`selectLeadsDueForFollowUp`) instead of each independently full-table-scanning in memory
- [x] Admin Assistant gains `propose_create_lead` (write-confirm) — the agent could previously only read/update leads, never originate one
- [x] Leads page: real server-side filters (status/source/assignee/search/due), status options driven by the shared `LEAD_STATUSES` constant, and note-taking now preserves history in the activity timeline (previously `window.prompt` silently overwrote the single `notes` field)
- [x] Assignment rules screen: explicit "Apply to existing unassigned leads" action per active rule (previously a new/reactivated rule only ever applied to leads created afterward)

---

## Live Learning Operations (approved blueprint, L1 foundation in progress)

Authoritative design: `Coding Docs/14_Live_Learning_Operations.md`. Zoom remains the classroom
provider; Knowsia owns the learning-operation layer. Existing batch-level Zoom meetings and
attendance sync remain unchanged throughout; do not enable per-session Zoom creation before a
named pilot batch is approved.

- [ ] Confirm first pilot Batch, one-meeting-per-session policy, join window, attendance threshold, reminder schedule, and recording-retention period
- [~] L1 Foundation: schema (`live_sessions`, `live_session_audit_log`, `live_session_registrants`,
      plus schema-only `live_session_reminders`/`live_session_attendance` for L3), RLS, status
      workflow (including the Cancel/Reschedule actions with a mandatory reason, and the
      Control Centre UI for both), tutor assignment, staff scheduling Control Centre, and
      tutor read model (My Courses) are implemented. The student portal's "Next Class" card
      is live, gated on Confirmed+Paid eligibility. The join window is settled (2026-08-11):
      no pre-start gate at all — the link is live for the whole of the soonest session that
      has not ended, and disappears 60 minutes after its scheduled end.
      Migrations `202607250025/026/027` applied to production 2026-07-26; batch schedule
      generator and session-level Zoom adapter remain pending.
- [ ] L2 Student and Tutor workspaces: tutor host view, roster, materials, and Ghana-time calendar download (Next Class card and protected Join action are done, above)
- [ ] L3 Reliability: provider registration, per-session reminders, reschedule/cancellation flow, attendance reconciliation, and tutor/admin exception review
- [ ] L4 Learning value: recordings metadata and consent, released materials, tutor-approved AI summaries, catch-up tasks, and support requests
- [ ] L5 Intelligence: at-risk learner signals, completion rules, certificate eligibility input, tutor insight, and executive learning analytics
- [ ] Pilot one Batch end-to-end before enabling the model for every Course

---

## Platform convergence with KnowsiaApp (direction approved 2026-08-13)

Authoritative design: `Coding Docs/19_Platform_Convergence.md`.

There are two Knowsia codebases: this one (live, real money, cohort training) and `KnowsiaApp`
(`github.com/kwameaikins/KnowsiaApp`, sibling directory — FastAPI/Python + Next.js on Railway; AI
exam prep, built but never launched). **Decision: integrate the product, do not merge the
codebases.** Porting either way costs months and ends with less than exists today.

**The binding rule — people and money here; learning content and AI there; neither system rebuilds
the other's half.** Ownership table in Document 19 §3. This costs nothing and applies from today.

- [x] Boundary agreed and documented (Document 19 §3)
- [ ] Mirror §3 into KnowsiaApp's own CLAUDE.md — until then the boundary binds one repo only
- [ ] Stop-building list on the KnowsiaApp side: M10 Affiliate, M11 CRM, and the `notif_`
      email/SMS/WhatsApp senders. All three were already deferred or stubbed there and all three
      ship working here
- [ ] Record which Supabase project(s) each system uses — needed before the account link is designed

Integration seams, in the founder's chosen order. **None of these start before this repo clears
its Paystack test-mode gate and goes live** — the work is small but it is not more urgent than
taking the first real payment:

- [~] I — Account link + handoff token. **Registration half built 2026-08-13.** Opaque single-use
      token (`knowsia_app_handoff_tokens`, 60s) + `participants.knowsia_app_user_id`, three routes
      (`POST /api/portal/handoff`, `/api/integration/handoff/verify`, `/api/integration/handoff/link`),
      a dormant "Open Knowsia Study" banner on the student portal, and 15 unit tests. Identity comes
      from the session cookie — the mint endpoint takes no body at all, so it cannot be pointed at
      anyone else. Chose an opaque token + service-key callback over a self-contained JWT: genuinely
      single-use, no new dependency, and an intercepted token is worthless without
      `KNOWSIA_APP_SERVICE_KEY`. BR-45, Document 3 §16, Document 5 §18.
      Migration `202608130061_knowsia_app_account_link.sql` **applied to production 2026-08-13 and
      verified present in `supabase migration list`** (62 migrations, 0 pending). Schema is ahead
      of the app on purpose — the integration stays dormant until `KNOWSIA_APP_URL` +
      `KNOWSIA_APP_SERVICE_KEY` are set, so nothing writes the new columns yet.
  - [ ] KnowsiaApp half: accept the token at `/auth/handoff`, call verify, find-or-create its
        `m1_users` row, call link, and store its own back-link. Separate repo, separate pass
- [ ] II — One domain / shared navigation: Vercel path rewrites, both frontends being Next.js.
      Cosmetic, no data change, but it is what makes the two feel like one product
- [ ] III — Paid cohort grants question-bank access: hangs off the existing
      `runPaidTransitionSideEffects` (already the single place every paid-transition consequence is
      wired), fire-and-forget and idempotent. First integration with real product value

Open product question, not an engineering one: whether Knowsia runs a tutor marketplace at all
(KnowsiaApp M9). This repo's tutors *teach your cohorts*; M9's tutors *sell their own courses*.
They are different concepts and must not be merged before that question is answered.

---

## Knowsia Live — self-hosted RTC (assessed 2026-08-13, NOT being built)

Authoritative design: `Coding Docs/18_Knowsia_Live_RTC.md`. Source analysis:
`Coding Docs/knowsia-live-mediasoup-engineering-plan.md`.

**Founder decision 2026-08-13: do not build this now.** The product has not launched (Paystack
test-mode gate unreached, pivot-or-persevere gate unreached), Live Learning L1 is itself
incomplete, and the plan's headline benefit — exact attendance identity — was largely delivered by
the 2026-08-06 Zoom attendance work. Zoom remains the classroom provider. The one budget question
that would unblock a build (~EUR 50-150/month bare metal; four figures per session on any metered-
egress host) is unresolved and no exception has been approved.

**SFU choice settled: LiveKit, self-hosted — not mediasoup.** Same deployment ownership, and it
ships simulcast, active speaker, multi-node, recording/egress, and the token identity model as
built-ins, i.e. most of the source plan's sections 4-7, 13, 20, 28. Rationale and the full
deviation list in Document 18 §3.

The prerequisite items below are **owed regardless** and are $0 — they are Live Learning work, not
RTC work, and doing them is what keeps the SFU decision cheap to reverse:

- [ ] P1 Provider adapter: widen `LiveSession.provider` (already a `'zoom'` literal in
      `modules/live-sessions/types.ts`) to a union, add the column, and move `lib/zoom/client.ts`
      behind a `LiveSessionProvider` interface. Required by Document 14 §1 for Teams/Meet anyway
- [~] P2 Close the Zoom registrant gap — **root cause proven and first real fix landed
      2026-08-14** (see the resolved block below). Nothing was wired wrong: every Paid path reaches
      `ensureZoomRegistration`, but it threw into callers that only `console.error`-ed, so a
      permanent account-wide failure was indistinguishable from success. It now returns `'failed'`
      and reports to Sentry. Likely root cause is Zoom's `approval_type: 2` ("no registration
      required"), the default for a meeting created by hand in the console — no scope grant fixes
      that. New `POST /api/cron/zoom/registrants/backfill` (CRON_SECRET, dry-run by default, not in
      vercel.json) reports `approvalType` for a batch and can register the backlog; enabling
      registration on a live meeting is opt-in only. Doc 7 §9.4, Doc 5 §19
  - [x] Read `approvalType` for every batch — **all four were `2` (registration off)**.
        Account-wide, not a one-off. Batch ids:
        AUG 2026 (08-15) `98433b5e-18b2-4945-8fe1-3a2db20080d9` / meeting `84968782138`;
        July 2026 (to 08-16) `0b0e203a-e2fd-4897-a289-00e6521e330a` / `82545109642`;
        ESG2 (08-06, finished) `d513145e-aa95-40a3-bd34-84e6e7b49e11` / `81420483944`;
        IA02 (07-25, finished) `55d7e0aa-8fcf-4a63-b5b1-7b5da2f2a82e` / `89951984118`
        NOTE the local `.env` CRON_SECRET does NOT match production, and `vercel env pull`
        returns an 11-char placeholder for it (Sensitive var). Runs were done against a
        local dev server pointed at the production database instead.
- [x] **2026-08-14: ROOT CAUSE PROVEN.** The meetings have registration switched off, and the
      Zoom app lacks the permission to switch it on. Zoom's own words:
      `{"code":404,"message":"Registration has not been enabled for this meeting"}`.
      Scopes held: create meeting, add registrant, dashboard participants. Scopes MISSING:
      `meeting:read:meeting` and `meeting:update:meeting` (Zoom splits create from update).
      So `getMeetingRegistrationState` and `enableMeetingRegistration` are both inert until a
      scope is granted — they now fail loudly rather than pretending. Doc 7 §9.4.1
- [x] **FOUNDER GRANTED the scopes** (`meeting:read:meeting:admin` +
      `meeting:update:meeting:admin`), verified present in the token's own scope list
- [x] **AUG 2026 class (08-15) FIXED.** Registration switched `2 → 0` and read back to
      confirm; 2 of 3 students registered, personal links stored and `zoom_link` emailed —
      the first rows `zoom_registrants` has ever held
- [~] 3rd student blocked by a Zoom **429**: add-registrant is capped at **3/day per
      registrant email**, and that address had been used as the diagnostic probe earlier the
      same day. **Lesson: never diagnose against a real participant's email.** Resets 00:00
      UTC; Windows scheduled task `KnowsiaRegisterLateStudent` (00:10 on 08-15, script at
      `E:\dev\temp\knowsia-ops\register-late-student.ps1`) re-runs the idempotent backfill.
      Fallback if the machine is off: the student can now self-register from the normal
      meeting link, and attendance still matches them by email
- [ ] **FOUNDER DECISION — July 2026 batch** (`0b0e203a…` / `82545109642`), mid-course to
      08-16. Enabling registration sends students holding the shared link to a sign-up page
      with two sessions left. The two finished batches gain nothing — leave them
- [ ] P3 Finish L1's batch schedule generator (already listed above)

Not scheduled, gated behind a budget exception that does not exist yet: Stage 1 (RTC-0..RTC-3,
tutorials only), Stage 2 (simulcast, coturn, recording to R2), Stage 3 (100 -> 500 load tests,
multi-node), Stage 4 (concurrent classes, cutover eligibility). See Document 18 §7.

**Revisit when:** the product has launched and is taking real payments, Live Learning L1-L3 are
complete, and Zoom cost or capacity has become a felt constraint rather than an anticipated one.

---

## Batch capacity, waitlist, and payment installments (founder-approved 2026-07-24)

Migration `202607240017_waitlist_payment_plans.sql` (batches.capacity, waitlist_entries,
payment_installments) plus `202607250028_installment_reminder_email_type.sql` (adds
`installment_reminder` to email_templates). Both applied to production 2026-07-26.

- [x] Batch capacity field (Courses screen) with seats-remaining/isFull surfaced on the public registration form
- [x] Waitlist: a full batch's public submission becomes a `waitlist_entries` row instead of a Registration (same form, same endpoint — the server decides); confirmation email on joining
- [x] Automatic seat-freed promotion: emails the oldest waiting entry (with a `?batchId=` deep link back to `/register`) when an admin deletes a registration or raises a batch's capacity
- [x] Admin waitlist visibility on the Courses screen (per-batch, lazy-loaded)
- [x] Payment plan: portal self-service "pay half now, half later" (only while Unpaid, only when the course starts far enough out); reconciled automatically against the aggregate `payments.amount_paid` on every webhook/manual payment (the aggregate row stays the sole BR-04/05/06 source of truth)
- [x] `installment_reminder` email (new EmailType), a few days ahead of the second installment's due date, bundled into the existing daily cron
- [x] Staff visibility: payment plan shown on the Registration 360 view (admin/finance only, same rule as other payment audit fields)
- [x] Discount rebalancing: a staff discount granted after a payment plan is set up now re-splits the new, discounted total 50/50 across the two installments — never shrinking either below what's already been paid on it

---

## Corporate Registration, Portal, and Dashboard (founder-approved 2026-07-26, urgent — all 4 phases shipped)

Migration `202607260032_corporate_registration.sql` (companies, company_batch_allocations,
company_admin_auth/sessions, registrations.company_allocation_id). See
`Coding Docs/15_Corporate_Operations.md` for the full spec and BR-26 through BR-30.

- [x] Phase 1 — Staff-side: `modules/corporate` (companies, seat allocations, employee
      add-by-paste reusing the bulk-import row logic), on-demand invoice PDF
      (`lib/corporate/invoice-pdf.ts`, no stored invoice record), staff screens at
      `/corporate`, capacity reservation (`coursesService.adjustBatchCapacityInternal`) so a
      sold-but-unfilled seat is never oversold to the public
- [x] Phase 2 — Company portal: `company_admin_auth`/`company_admin_sessions` mirror the
      participant portal's PIN + session-cookie pattern exactly, scoped to `company_id`;
      `/company-portal` dashboard with self-service employee add (capped at the company's own
      remaining seats, and can never mark a payment Paid — BR-12) and invoice download
- [x] Phase 3 — Dashboard: `corporateService.getCorporateSummary()` (companies, seats sold/
      filled, invoiced/settled, computed live) folded into `dashboardService
      .getDashboardSummary()`; new Corporate card on the Management Dashboard
- [x] Phase 4 — Docs: new `Coding Docs/15_Corporate_Operations.md`; trailing Extension
      sections added to Docs 1/3/4/5/8; Doc 6 backfilled with the previously-undocumented
      participant/company portal auth model (Section 13); PRD Section 9/4.2's stale
      "no participant self-service portal" lines corrected (that feature shipped 2026-07-22)
- [x] *(external)* Apply migration `202607260032` to production — confirmed via
      `npx supabase migration list` (2026-07-26)
- [ ] *(external)* Founder creates the first real Company + sells its first seat allocation
      against a real batch to confirm the end-to-end flow before the live session

---

## Student portal gap-closing (founder-approved 2026-07-26)

Audit of `modules/portal` against portal best practices found the architecture sound; five
additive gaps closed, no rebuild needed. See `Coding Docs/06_Security_and_Authentication.md`
Section 13 for the forgot-PIN token pattern.

- [x] Phase A — Receipt PDF (`lib/portal/receipt-pdf.ts`, on-demand, never stored), message
      history (`communicationsService.getMessageLogForRegistrations`, new registration-scoped
      repository query), "Explore other courses" section
      (`coursesService.getActiveBatchesForPublicForm`, excludes already-registered batches),
      support-contact footer
- [x] Phase B — Self-service PIN recovery: `/portal/forgot-pin` → emailed single-use link →
      `/portal/reset-pin`, backed by a new `participant_pin_reset_tokens` table (migration
      `202607260033`, RLS enabled with zero policies, same posture as `portal_login_tokens`).
      No enumeration (same generic result regardless of match). Resetting also clears any
      lockout, so this doubles as locked-out-account recovery.
- [ ] *(external)* Apply migration `202607260033` to production (`npx supabase db push`)

---

## Tutor Portal (founder-approved 2026-07-27, both phases shipped)

Tutors are external parties, not Knowsia staff — retires the earlier staff-role Tutor
experience (`/my-courses`) for a third non-staff portal tier, same architecture as the
participant and company portals. See `Coding Docs/16_Tutor_Operations.md` for the full spec
and BR-31 through BR-34.

Migration `202607270034_tutor_portal.sql` (tutors, tutor_auth/tutor_sessions,
batches.facilitator_tutor_id, live_sessions.tutor_id, drops the 4 dead tutor RLS policies and
`'tutor'` from the staff_users.role CHECK constraint).

- [x] Phase 1 — Schema + staff-role retirement: new `tutors` table (deliberately not
      `staff_users`); `'tutor'` removed from `StaffRole`, every role allow-list, and the
      `/my-courses` page (deleted); new `/tutors` staff screen (`modules/tutors` staff CRUD,
      admin/management); Courses and Live Sessions facilitator/tutor pickers now draw from
      `tutors` instead of staff accounts
- [x] Phase 2 — Tutor portal: `tutor_auth`/`tutor_sessions` mirror the company admin portal's
      PIN + session-cookie pattern exactly, scoped to `tutor_id`; `/tutor-portal` dashboard
      (Overview, My Schedule with a working Zoom join link, Roster, Attendance read-only,
      Certificate Eligibility read-only, Account) using the same shared app shell as
      `/portal`/`/company-portal`
- [x] Docs: new `Coding Docs/16_Tutor_Operations.md`; trailing Extension sections added to
      Docs 1/3/5/8; Doc 6 Section 13 extended to a three-tier non-staff session model; Doc 14's
      "Tutor workspace" vision section marked superseded; BR-31 through BR-34 added to Doc 4
- [ ] *(external)* Apply migration `202607270034` to production (`npx supabase db push`) — the
      pre-check caught exactly the case it was designed for: a real `staff_users` row with
      `role = 'tutor'` existed in production (first `db push` attempt, 2026-07-27, failed
      loudly with no data corruption — the whole migration rolled back cleanly since it runs in
      one transaction). The migration now removes any such row itself and prints its name/email
      via `RAISE NOTICE` (visible in the `db push` output) instead of failing outright — rerun
      the push, then recreate that person as a proper Tutor via `/tutors` with their phone
      number (not carried over automatically — `staff_users` has no phone column).
- [ ] *(external)* Founder creates the first real Tutor record and confirms the end-to-end
      portal login flow before relying on it

---

## Tutor Portal — Phase 4 (founder-approved 2026-07-31, foundation shipped)

A follow-up review of "what access should a tutor have" against best practice and the original
Live Learning Operations vision. See `Coding Docs/16_Tutor_Operations.md` §11 for the full
breakdown of what shipped vs. what's deferred, and why.

Migrations `202607290037_tutor_action_audit_log.sql`, `202607290038_attendance_exceptions.sql`,
`202607290039_session_materials.sql`.

- [x] Tutor action audit log — every tutor-portal self-service write is now logged
      (`tutor_action_audit_log`); staff view on `/tutors`
- [x] Attendance Exceptions — tutor-raised no-show flags and correction requests, admin-reviewed
      on `/attendance`; BR-34 unchanged (a tutor never writes to `attendance` directly)
- [x] Session Materials — tutor-shared material links per batch (link-based, no file storage,
      same precedent as `batches.resources_link`), visible on `/live-sessions` (staff) and the
      student portal's new Materials tab
- [x] Registered-student count surfaced on the tutor's batch selector (not a payment field)
- [x] Bug fix: tutor-portal Attendance panel was silently empty (RLS-gated client used for a
      caller with no Supabase Auth session) — added a service-role read path
- [ ] *(founder decision needed)* Tutor payment/financial visibility — requested mid-build,
      reverses BR-33; scope undecided (aggregate batch total vs. per-student amounts) — do not
      build without explicit sign-off on scope
- [ ] *(external)* Apply migrations `202607290037`–`202607290039` to production
      (`npx supabase db push`)
- [ ] Deferred, no shape committed except where noted: recording release (link-based, like
      Materials), learner follow-up notes, substitute handover, availability/blackout dates,
      tutor→roster messaging (**suspended** — moderation mode undecided), tutor compensation
      tracking (**shape decided** — full rate-based, but deferred; no payable-session rule exists
      yet)

---

## Registrant Messaging for the Admin Assistant (2026-08-01)

Closed a gap: the Admin Assistant could message **leads** one-off and in bulk (campaigns), but
had no equivalent for **registrations** — people who'd actually registered, as opposed to sales
leads. Full parity added — see `Coding Docs/07_Integration_Specifications.md` §11.1/§11.2 for the
new `ad_hoc` call type.

Migrations `202607290040_ad_hoc_calls.sql`, `202607290041_registration_campaigns.sql`.

- [x] `search_registrations` — new read tool: filter by course/batch/payment status/registration
      status/free text, so the assistant can find a specific registrant to message
- [x] `propose_send_sms_to_registration` / `propose_send_email_to_registration` — one-off
      free-text sends to a registrant's participant contact info, same write-confirm pattern and
      audit trail (`staff_action_audit_log`) as the existing lead versions; not logged to
      `email_log`/`sms_log` (same precedent as leads — those tables are a closed-enum template
      pipeline, not a fit for free text)
- [x] `propose_call_registration` — new capability, no lead equivalent existed: triggers a real
      Vapi outbound call reading a staff-composed message (`call_log.call_type = 'ad_hoc'`,
      exempted from the one-call-per-type unique pair so a registrant can get more than one)
- [x] `propose_create_campaign` extended with `audienceType: 'leads' | 'registrations'` — a
      campaign can now target a filtered slice of registrations (batch/course/payment
      status/registration status) instead of leads; `campaign_members.lead_id` is now nullable
      alongside a new nullable `registration_id` (exactly one set, enforced by a CHECK constraint)
- [ ] *(external, required before ad-hoc calls say anything)* Paste the `ad_hoc` branch into the
      Vapi outbound assistant's dashboard prompt — see `07_Integration_Specifications.md` §11.3
      for the exact text. Not deployable via migration or code; the call will dial fine without
      it, the assistant just won't know what `ad_hoc` means yet.
- [ ] *(external)* Apply migrations `202607290040`–`202607290041` to production
      (`npx supabase db push`)
- [ ] Not built (explicitly out of scope for this pass): a staff-UI messaging entry point outside
      the Admin Assistant — matches how lead messaging already works, no dedicated page today

---

## Class reminders, upsell/cross-sell, and WhatsApp group invitation (2026-08-01)

Founder-flagged gap: `class_reminder_24h`/`class_reminder_2h`, `upsell`, and `whatsapp_invite`
already existed as `EmailType` slots on the Messaging screen but had zero template content and zero
trigger logic — "Not written yet — this email is skipped" for all four, in production, this whole
time. Only the *voice-call* version of upsell (Vapi) was real. Closed across email + SMS + WhatsApp.

Migration `202608010042_reminder_upsell_whatsapp_invite_types.sql`.

- [x] Default template content authored for all 4 types (draft copy — founder to review/edit on the
      Messaging screen) and backfilled onto all 13 existing courses (one-off script, 52 rows)
- [x] `class_reminder_24h`/`2h` — new `modules/communications/class-reminder-scheduler.ts`
      (`runClassReminderDispatch`), keyed off `batches.start_date`+`start_time` (Ghana is UTC+0
      year-round, no timezone library needed). 24h is date-level precision (daily cron is enough,
      same philosophy as reminder_3/4); 2h needs finer timing than Vercel Hobby's once-daily cron
      allows
- [x] `upsell` (email/SMS/WhatsApp) — new `modules/communications/upsell-scheduler.ts`
      (`runUpsellMessageDispatch`), reusing the voice call's exact eligibility logic via a new
      `voiceService.getUpsellCandidates` wrapper (no new matching logic). Inherits the voice call's
      existing "one pitch ever per registrant, per channel" limitation (log-table dedup key has no
      per-course dimension) — not new, not fixed this pass
- [x] `whatsapp_invite` (email/SMS/WhatsApp) — event-triggered, not cron: added to
      `modules/payments/service.ts`'s `runPaidTransitionSideEffects`, the one funnel all 3
      Paid-transition paths already go through exactly once
- [x] New `app/api/cron/class-reminders-frequent` route + `.github/workflows/
      class-reminders-frequent.yml` — a free external scheduler (every 15 min) for the 2h-before
      precision Vercel Hobby's cron can't hit, since both its 2 allowed job slots are already used
- [ ] *(external)* Add `CRON_SECRET` as a GitHub Actions repository secret (Settings → Secrets and
      variables → Actions) — same value as the Vercel env var. Workflow won't run without it
- [ ] *(external)* The 4 new WhatsApp sends need Meta Business Manager templates created + approved
      (`course_class_reminder_24h`, `course_class_reminder_2h`, `course_upsell_pitch`,
      `course_whatsapp_group_invite` — positional params documented in the migration header) before
      they'll actually send; code is wired regardless, same dormant-until-configured posture as
      every other WhatsApp message type
- [x] *(external)* Apply migration `202608010042` to production — applied 2026-08-02 (`npx supabase db push`)
- [ ] Review/edit the 4 default templates' copy on the Messaging screen before relying on them —
      they're founder-requested placeholder drafts, not reviewed final copy

---

## Self-service payment submission + staff approval (2026-08-02)

Registrants paying by MTN MoMo or bank transfer previously had to email a transaction reference and
wait for staff to manually reconcile it. Added a portal form (with an optional payment-slip upload)
that queues into a finance/admin review screen; approving reuses the existing `applyPaymentUpdate`
so BR-04/05/06/12 all keep working unchanged. Closest precedent: `attendance_exceptions`
(submitter-raised row, always starts `pending`, only a staff review can change real state).

Migration `202608010043_payment_submissions.sql`.

- [x] Portal: "I've already paid via MoMo or bank transfer" action next to the existing Paystack
      "Pay Now" button — method/amount/reference/date + optional slip (JPEG/PNG/PDF, max 5MB);
      shows "awaiting confirmation" while pending, and the staff review note + a resubmit option if
      rejected
- [x] Staff: a "Payment Submissions" view on the existing Payments screen — finance/admin only,
      approve (editable amount/reference/date before confirming) or reject with a note
- [x] **First file-upload capability in this codebase** — slips are stored in **Cloudflare R2**
      (founder-directed 2026-08-02, not Supabase Storage), via a new small `lib/r2/client.ts` using
      `aws4fetch` (a ~5KB request-signer, not the full AWS SDK, matching this app's plain-fetch
      integration style). Staff view a slip through a short-lived (5 min) presigned URL — file bytes
      never pass through our own server
- [x] One-pending-submission-at-a-time enforced at the DB level too (partial unique index), not just
      in the service layer
- [x] Approval math is additive: a submission's claimed amount is added to the registration's
      existing `amount_paid`, never replaces it (this was the trickiest correctness point —
      `applyPaymentUpdate` sets the total, it doesn't add)
- [ ] *(external)* Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
      `R2_BUCKET_NAME` to Vercel — create the bucket + API token in the Cloudflare dashboard first
      (`.env.local.example` documents the four vars). Slip uploads are gated off
      (`isR2Configured()`) until all four are set; nothing else in this feature depends on R2
- [x] *(external)* Apply migration `202608010043` to production — applied 2026-08-02 (`npx supabase db push`)

---

## Knowsia Growth Partner Programme (founder-approved 2026-08-02, all-in scope)

Affiliate/partner marketing + coupon codes, per `Coding Docs/knowsia_growth_partner_programme.md`
(the founder's detailed strategy doc — supersedes an earlier, smaller plan from the same day).
Founder chose the maximal scope on every open question: all 4 partner categories now, codes +
tracked referral links, a public application form with manual approval, and a hold period of
whichever is later of "14 days after payment" or "the batch has started."

One `codes` table serves both coupon-discount and partner-attribution duty. Commission pipeline is
`Tracked -> Pending -> Approved -> Payable -> Paid`; Tracked is a derived state (a `code_redemptions`
row exists with no `partner_commissions` row yet, not a stored status) — a commission is only ever
created once a payment actually clears, computed on the amount actually paid, never the listed
course fee. Tutor Partners get no second login — a category='tutor' partner authenticates through
their existing tutor portal, which gained a new "Referrals" panel.

Migration `202608020044_partners_and_codes.sql`.

- [x] Schema: `partners`, `partner_auth`/`partner_sessions` (zero-policy, service-role only, mirrors
      `company_admin_auth`), `codes`, `code_redemptions` (existing-lead + self-referral fraud flags),
      `partner_link_clicks`, `partner_commissions`, `partner_payouts`
- [x] `modules/partners/` — commission-rate lookup (Ambassador tiered %, Institutional tiered flat
      fee, Tutor flat 10%, Strategic manual-or-none), code validation/redemption, payment-clears
      commission accrual, cron-driven qualification dispatch, payout workflow, partner-portal auth
- [x] Fraud checks wired into `modules/registrations/service.ts`'s `createRegistration` *before*
      `leadsService.createLead` runs (the existing-lead signal is gone once that dedup logic fires);
      best-price-wins fee math (a code discount never stacks with the early-bird discount)
- [x] Commission accrual hooked into `modules/payments/service.ts`'s `runPaidTransitionSideEffects`
      (now takes the actual `amountPaid`); qualification dispatch bundled into the existing 07:00
      cron (Vercel Hobby's two-job cap is already fully used)
- [x] `/r/[code]` tracked-link redirect + 30-day `knowsia_ref_code` cookie; explicit code always
      wins over the cookie at registration time
- [x] Public: `/partners/apply` (Ambassador/Institutional only), coupon field + live discount
      preview on `/register`
- [x] `/partner-portal` (non-tutor categories — mirrors `modules/corporate`'s PIN + session-cookie
      pattern exactly) with codes/QR, click/redemption counts, commission totals, payout history
- [x] Tutor portal gained a "Referrals" panel — no second login, per the doc's own instruction
- [x] Staff console at `/partners` — Applications / Partners / Codes / Commissions & Payouts,
      admin+marketing for the first three, finance+admin for the last
- [x] Unit tests: tier boundaries, the Tracked→Pending transition firing only on payment, the
      `qualifies_at = GREATEST(...)` math, existing-lead/self-referral exclusions, payable/payout
      double-review guards, best-price-wins fee math
- [x] *(external)* Apply migration `202608020044` to production — applied 2026-08-02 (`npx supabase db push`)

**Explicitly deferred** (the doc's own "Scale," Days 46–90, not "Foundation"): performance bonuses,
the marketing/campaign content library, the partner leaderboard, subscription/renewal commissions
(no subscription product exists — courses are one-time purchases), and the fuller admin fraud/
analytics suite (duplicate-account detection, refund-rate dashboards, partner profitability).

---

## Existing-tutor/student self-serve referrals + commission-as-course-credit redemption (2026-08-02)

Same-day follow-up to the Partner Programme above, closing three gaps: existing tutors weren't
automatically partners (contrary to the doc's own intent), existing students had no easy way to
become referrers, and a partner's only way to get paid was a cash payout — never a course-fee
discount, even for a student who'd rather spend their earnings on their own tuition.

Migration `202608020045_partner_credit_redemption.sql`.

- [x] `partners.participant_id` (nullable, mirrors `tutor_id`) — links a self-served Ambassador
      partner to their own student record
- [x] `partner_commissions.status` gains `redeemed` (terminal, alongside `paid`) +
      `redeemed_against_registration_id`
- [x] `ensurePartnerForTutorSystem` — auto-provisions a partner record + one referral code the
      first time a tutor views Referrals; admin "Backfill Tutor Partners" button on `/partners`
      provisions the whole existing roster in one click
- [x] Student portal gained a "Refer & Earn" panel — self-serve, auto-approved Ambassador signup,
      no application, no staff review
- [x] `redeemCommissionCreditSystem` (`modules/payments/service.ts`) — spends a partner's own
      `payable` balance as course-fee credit, toward their own registration or a referred
      student's (resolved from email); reuses `applyDiscount`'s exact fee math, system-originated;
      payments owns the fee write, partners owns the commission bookkeeping (same split as the
      existing accrual/payout flow)
- [x] Wired into the tutor portal, student portal, and partner portal — each partner category can
      redeem from wherever they already log in
- [x] *(external)* Apply migration `202608020045` to production — applied 2026-08-02 (`npx supabase db push`)
- [ ] *(action)* Click "Backfill Tutor Partners" once on `/partners` to provision existing tutors
      immediately — new tutors auto-provision on their first Referrals-panel view regardless

---

## Course-specific referral links & QR codes (2026-08-02, same-day follow-up)

Tutors/students could refer via a code or a generic tracked link, but the link always dropped a
visitor on a plain `/register` with no course pre-selected — friction the founder asked to remove.
Turned out `RegistrationForm.tsx` already pre-selects a batch from `?batchId=` (built for the
waitlist email), so this was mostly about wiring existing plumbing through, plus closing a real gap:
the tutor and student portals had no shareable link/QR at all (only the standalone partner portal
did).

- [x] `app/r/[code]/route.ts` forwards an optional `?batchId=` straight into the `/register`
      redirect — no server-side validation, an unknown/expired batch id just falls back to
      "Select a course" via the register form's own existing check
- [x] `buildReferralUrl`/`generateReferralQrDataUrl` take an optional `batchId`
- [x] New public `GET /api/register/active-batches` — unauthenticated, same batch list `/register`
      already shows, feeds the new course-picker dropdowns
- [x] New `GET /api/tutor-portal/qr-code` and `GET /api/portal/qr-code`, mirroring the existing
      `/api/partner-portal/qr-code` ownership-check pattern exactly
- [x] All three referrer portals (student "Refer & Earn", tutor "Referrals", partner portal's
      Codes panel) get, per code: a course picker, a reactive link, "Copy link" (new — first
      `navigator.clipboard` usage in this codebase), and "Show QR code"
- [x] Unit tests for `buildReferralUrl` with/without a `batchId`

No schema change — the batch id is a transient query-string hint, never persisted, and has no role
in attribution or commission math (both untouched by this change).

---

## Risk watch (carried from `/docs/01_PRD.md` risk register)

| ID | Risk | Status |
|---|---|---|
| RISK-P01 | Ghana DPA non-compliance | ⬜ Open until Week 4 gate passes |
| RISK-P02 | Bank transfer manual verification | ✅ Designed in from Week 2 |
| RISK-P03 | Supabase 7-day inactivity pause | ✅ Mitigated by Uptime Robot (Week 4) |
| RISK-P05 | Timeline pressure | ✅ Week 5 buffer explicitly reserved |
| RISK-P06 | Cost of delay (30 registrations/week manual) | Ongoing — do not scope-creep Phase 1 |
