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
- [ ] **RLS test cases T-RLS-01 through T-RLS-07 run and passing** — database SQL suite passed; API-level T-RLS-03 and anonymous-access T-RLS-06 still need live verification

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
- [ ] *(external)* Zoom Server-to-Server OAuth app created; `ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET` in Vercel
- [ ] *(external)* Class meetings created in Zoom with Registration: Required; meeting IDs set on batches
- [ ] Live test: payment → personal link email; after a session, attendance rows appear

### Admin messaging editor + AI assistant (scope addition, approved 2026-07-19 — Doc 7, Section 10)

- [x] Messaging screen (admin): write/edit per-course templates for all 13 email types, active toggles
- [x] `/api/templates` GET/PUT (admin), upsert via RLS-enforced admin policy
- [x] Assistant screen (admin): Claude tool-runner over existing services (courses, batches, users, templates, dashboard)
- [ ] *(external)* `ANTHROPIC_API_KEY` set in Vercel (assistant returns "not configured" until then)

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
- [ ] Known gap: handwritten signature images not embedded (typeset signatories instead) — drop signature PNGs in later for pixel-parity with the Canva design
- [ ] Known gap (DPA): soft-deleted participants' certificates keep recipient_name — extend the erasure function to revoke + scrub linked certificates
- [x] Backfill: all 101 legacy registry certificates imported (original KNW numbers, 1 revoked); verification live for all three states
- [x] Serials continue across prefixes AND respect the legacy AppScript counter as a floor (`courses.certificate_serial_floor` from the catalog CSV — e.g. next AI01 = KNS-AI01-2026-0067, next CA01 = KNS-CA01-2026-0021)

### Course/catalog hardening (system review, approved 2026-07-20)

- [x] Migration `202607200011` — courses carry certificate metadata (hours, description, CPD credit) + serial floor; `fn_soft_delete_participant` now revokes and scrubs the erased participant's certificates (DPA gap closed)
- [x] Default email templates auto-seed on course creation (insert-only, never overwrites edits) — the "new course silently sends no email" trap is closed
- [x] Course editing on the Courses screen (name + certificate fields; course code immutable — baked into cert numbers); `PATCH /api/courses/[id]`
- [x] Catalog imported: 10 new courses created from the founder's CSV (AI01–03, CA01–04, FR01–02, IA01), ESG1 updated; 90 default template rows seeded for the new courses
- [x] Batch certificate issuance prefills hours/description/CPD from the course
- [ ] Open question for founder: AI05 ("…Reporting and Modeling", has the live JUL 2026 batch) overlaps legacy AI02 ("…Reporting and Analysis") — decide which code is canonical for future batches
- [ ] Still pending from the review: batch capacity (max seats) + session-days schedule, registration 360° view, dashboard attendance/feedback/certificate metrics, signature PNGs for the certificate PDF (founder uploading)

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
- [ ] Load test run — 10 concurrent registrations, no corruption (Section 7, Document 9)
- [ ] Load test — simultaneous duplicate registration attempt, exactly one succeeds
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

## Risk watch (carried from `/docs/01_PRD.md` risk register)

| ID | Risk | Status |
|---|---|---|
| RISK-P01 | Ghana DPA non-compliance | ⬜ Open until Week 4 gate passes |
| RISK-P02 | Bank transfer manual verification | ✅ Designed in from Week 2 |
| RISK-P03 | Supabase 7-day inactivity pause | ✅ Mitigated by Uptime Robot (Week 4) |
| RISK-P05 | Timeline pressure | ✅ Week 5 buffer explicitly reserved |
| RISK-P06 | Cost of delay (30 registrations/week manual) | Ongoing — do not scope-creep Phase 1 |
