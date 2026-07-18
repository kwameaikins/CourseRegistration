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
- [ ] First real Admin account created and can log in *(Auth account exists; active `staff_users` Admin row and login smoke test pending)*
- [x] Course Control Panel screen built (F1.02) — Admin can create a Course and Batch
- [x] Staff User Management screen built (US-A05)
- [ ] Remaining 5 staff accounts created *(via the Users screen once live)*
- [x] Middleware route protection implemented (`/docs/06_Security_and_Authentication.md`, Section 3)
- [x] Google OAuth application flow implemented (`/auth/callback`, PKCE code exchange, safe redirect validation)
- [ ] Google Cloud OAuth client + Supabase Google provider configured and live sign-in tested *(external)*
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

- [ ] Resend account set up *(external)*
- [ ] **Sending domain DNS verification started — flag: up to 48h propagation, start Day 11 at the latest, ideally Week 1** *(external)*
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
  - [x] Unit level: 73 Vitest tests passing (`npm run test`) — BR-03/04/07/08/13/14/15/19 logic, webhook, email and WhatsApp engines, dashboard
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
