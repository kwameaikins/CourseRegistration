# Centralised Course Registration & Follow-Up System
## Test Specification

---

| Field | Value |
|---|---|
| **Document** | Test Specification |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | AI Coding Agent |
| **Input from** | All previous documents (1–8) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Initial test specification |

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Test Levels](#2-test-levels)
3. [Critical Business Rule Test Cases](#3-critical-business-rule-test-cases)
4. [Integration Test Cases](#4-integration-test-cases)
5. [RLS Policy Test Cases](#5-rls-policy-test-cases)
6. [Manual Pre-Launch Test Checklist](#6-manual-pre-launch-test-checklist)
7. [Load Test](#7-load-test)
8. [Ready for Development Checklist](#8-ready-for-development-checklist)

---

## 1. Testing Philosophy

Per P4.03 (test thoroughly at all levels) balanced against P5.01/PX.02 (complexity is the
enemy) and the 5-week timeline (RISK-P05): testing effort concentrates on the areas with the
highest cost of failure — payment correctness, deduplication, and access control — rather
than achieving exhaustive coverage of low-risk UI rendering details.

**Priority order (PX.10 — sequence by assumption risk):**
1. Payment status derivation and webhook idempotency (money — highest cost of error)
2. Email deduplication (reputational cost of spamming participants)
3. RLS access control (data privacy, DPA compliance)
4. Registration flow correctness (core functionality)
5. UI rendering and navigation (lowest risk — caught quickly by manual use)

---

## 2. Test Levels

| Level | Tool | Coverage target |
|---|---|---|
| Unit tests | Vitest | All functions in `modules/*/service.ts` — business logic in isolation, with `repository.ts` mocked (PAT-005 enables this cleanly) |
| Integration tests | Vitest + Supabase local instance (`supabase start`) | Database triggers (BR-04, BR-06), unique constraints (BR-03, BR-07, BR-14), RLS policies |
| End-to-end tests | Playwright | The 3 highest-value user journeys only (Section 6) — not exhaustive E2E coverage, given timeline constraints |
| Manual testing | Founder + staff, Week 5 | Full Phase 1 feature walkthrough per role before go-live |

---

## 3. Critical Business Rule Test Cases

| Test ID | Business Rule | Test | Expected result |
|---|---|---|---|
| T-BR03-01 | BR-03 | Submit the same participant email + same batch twice | Second submission rejected with `DUPLICATE_REGISTRATION` (409) |
| T-BR03-02 | BR-03 | Submit two simultaneous requests (Promise.all) for the same participant + batch | Exactly one succeeds; one fails with `DUPLICATE_REGISTRATION` — proves database constraint, not application check alone, is preventing the race |
| T-BR04-01 | BR-04 | Set `amount_paid = 0` | `payment_status` resolves to `Unpaid` |
| T-BR04-02 | BR-04 | Set `amount_paid` between 0 and `course_fee` | `payment_status` resolves to `Part Payment` |
| T-BR04-03 | BR-04 | Set `amount_paid >= course_fee` | `payment_status` resolves to `Paid` |
| T-BR04-04 | BR-04 | Attempt to directly set `payment_status` via API without changing `amount_paid` | API discards the field; `payment_status` remains derived from `amount_paid` only |
| T-BR05-01 | BR-05 | Attempt a direct SQL `UPDATE` setting `balance` | Rejected by Postgres — generated columns cannot be written directly |
| T-BR06-01 | BR-06 | Update `payment_status` to `Paid` on a Registration with status `Registered` | `registration_status` auto-updates to `Confirmed` |
| T-BR06-02 | BR-06 (edge case EC-06 analog) | Set `registration_status = 'Cancelled'` manually, then set `payment_status = 'Paid'` | `registration_status` remains `Cancelled` — guard clause prevents override |
| T-BR07-01 | BR-07 | Trigger the same email type twice for the same Registration ID in rapid succession | Only one row exists in `email_log`; only one Resend API call is made |
| T-BR08-01 | BR-08 | Set `payment_status = 'Paid'` for a Registration, then immediately run the reminder cron logic for that Registration | No reminder is sent; job logs `skippedPaidSinceQuery` |
| T-BR13-01 | BR-13 | Send a webhook payload with an invalid/missing signature | 401 response; no database change occurs |
| T-BR14-01 | BR-14 | Send the identical Paystack webhook payload twice | Second call returns `already_processed`; no duplicate payment record or duplicate confirmation email |
| T-BR15-01 | BR-15 | Submit registration payload with `consentGiven: false` | 400 `CONSENT_REQUIRED`; no Registration created |
| T-BR19-01 | BR-19 | Query the registration form's batch list for a Batch with `start_date` in the past | Past batch is not returned |

---

## 4. Integration Test Cases

| Test ID | Integration | Test | Expected result |
|---|---|---|---|
| T-INT-01 | Paystack | Complete a real test payment in Paystack test mode | Webhook fires; `payments` row updates; confirmation email sends within 30 seconds (NFR, PRD Section 15) |
| T-INT-02 | Paystack | Verify `metadata.registration_id` is present in a test webhook payload | Field is present and matches the initiating Registration |
| T-INT-03 | Resend | Send each of the 7 Phase 1 email types to a real test inbox | All 7 render correctly with placeholders replaced; no `{{unfilled}}` placeholders visible |
| T-INT-04 | Resend | Simulate a Resend API failure (invalid API key temporarily) | `email_log.success = false` recorded; registration/payment operation still completes successfully |
| T-INT-05 | Supabase Cron | Manually trigger `/api/cron/reminders` twice in immediate succession | Second run sends zero additional emails (BR-07 backed) |
| T-INT-06 | Uptime Robot | Confirm `/api/health` returns 200 and does not require authentication | Endpoint reachable publicly, returns `{ status: 'ok' }` |

---

## 5. RLS Policy Test Cases

Critical for DPA compliance and role separation (BR-11). Each test authenticates as a real
Supabase user with the given role and attempts the query directly (bypassing the application
layer) to confirm RLS — not just application logic — is the enforcing mechanism.

| Test ID | Role | Query attempted | Expected result |
|---|---|---|---|
| T-RLS-01 | tutor | `SELECT * FROM registrations` (no filter) | Only rows where `registration_status = 'Confirmed'` AND batch is assigned to this tutor are returned — even though no `WHERE` clause was written by the caller |
| T-RLS-02 | tutor | `SELECT * FROM payments` | Zero rows returned — no RLS policy grants tutor any access to payments |
| T-RLS-03 | marketing | `SELECT payment_notes FROM payments` | Query succeeds at the row level (RLS allows it) but the application API layer must not expose this field — this test confirms the API-layer filter (Document 5 Section 3), separate from RLS, since RLS alone cannot enforce column-level restriction |
| T-RLS-04 | finance | `SELECT * FROM email_templates` | Zero rows — Finance has no access to templates |
| T-RLS-05 | An inactive staff account (`is_active = false`) | Any authenticated query | Zero rows across all tables — `fn_current_role()` returns null for inactive users, and no policy matches a null role |
| T-RLS-06 | anon (unauthenticated) | `INSERT INTO registrations` with a valid Active batch ID | Succeeds (public registration form path) |
| T-RLS-07 | anon (unauthenticated) | `SELECT * FROM payments` | Zero rows — no anon SELECT policy exists on payments |

---

## 6. Manual Pre-Launch Test Checklist

Executed by the founder and at least one staff member per role during Week 5 (Document 2,
implementation timeline), using real (not synthetic) course data for the approaching course
intake.

```
□ Admin creates the real Course and Batch for the approaching intake.
□ Admin creates all 6 real staff accounts with correct roles.
□ Each staff member logs in successfully and lands on their correct default page.
□ A test participant (team member using a personal email) completes the
   registration form on a mobile phone.
□ Welcome and Payment Instruction emails arrive within 30 seconds.
□ Test participant completes a real small-value Paystack test payment.
□ Payment Confirmation email arrives; Registration Status shows Confirmed
   on the Payment Tracking and Registration List screens.
□ Finance staff manually marks a second test registration as Paid via
   Bank Transfer; Verified By field auto-fills correctly.
□ Tutor logs in and sees only the Confirmed test participant(s) — no
   unpaid test registrations visible.
□ Management logs in and sees the Dashboard with correct counts for the
   test data.
□ Admin toggles a Batch to Inactive; confirms no further reminder fires
   for that batch on the next cron check.
□ Admin performs a test soft-delete on a dummy participant record; confirms
   data is anonymised and no longer visible in staff views.
```

---

## 7. Load Test

Given the NFR in Document 1 (Section 15: system must handle 10 simultaneous form
submissions without data corruption):

```
□ Use a simple script (k6 or Playwright's request API) to fire 10
   concurrent POST requests to /api/registrations with 10 distinct
   participant emails against the same Batch.
□ Confirm all 10 succeed with distinct Registration IDs and no database
   error.
□ Repeat with 2 requests using the SAME participant email + same batch
   (simultaneous duplicate attempt) — confirm exactly one succeeds
   (T-BR03-02, repeated under real network conditions rather than
   in-process Promise.all).
```

---

## 8. Ready for Development Checklist

```
□ 1. Unit tests written for all service-layer functions before each
      module is considered complete (test-alongside, not test-after).
□ 2. All 14 critical business rule test cases (Section 3) passing.
□ 3. All 6 integration test cases (Section 4) passing against real
      Paystack test mode and real Resend test sends — not mocked entirely.
□ 4. All 7 RLS policy test cases (Section 5) passing, run against actual
      authenticated Supabase sessions per role, not just application-level
      assertions.
□ 5. Manual pre-launch checklist (Section 6) completed in full by the
      founder and at least one staff member per role.
□ 6. Load test (Section 7) completed and passing before go-live.
□ 7. Next document to read: Document 10 — Implementation Plan.
```

---

*Document 10 of 12: Implementation Plan follows.*
