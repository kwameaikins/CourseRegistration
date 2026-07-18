# Centralised Course Registration & Follow-Up System
## API Contract and Endpoint Specification

---

| Field | Value |
|---|---|
| **Document** | API Contract and Endpoint Specification |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | AI Coding Agent |
| **Input from** | Document 2 (API Surface Map), Document 3 (Schema), Document 4 (Business Rules) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Full endpoint contracts, all 10 routes |

---

## Table of Contents

1. [Conventions](#1-conventions)
2. [Endpoint: Create Registration](#2-endpoint-create-registration)
3. [Endpoint: List/Get Registrations](#3-endpoint-listget-registrations)
4. [Endpoint: Courses](#4-endpoint-courses)
5. [Endpoint: Batches](#5-endpoint-batches)
6. [Endpoint: Update Payment](#6-endpoint-update-payment)
7. [Endpoint: Paystack Webhook](#7-endpoint-paystack-webhook)
8. [Endpoint: Cron Reminders](#8-endpoint-cron-reminders)
9. [Endpoint: Participant Deletion](#9-endpoint-participant-deletion)
10. [Endpoint: Dashboard Summary](#10-endpoint-dashboard-summary)
11. [Endpoint: Staff Users](#11-endpoint-staff-users)
12. [Error Response Standard](#12-error-response-standard)
13. [Ready for Development Checklist](#13-ready-for-development-checklist)

---

## 1. Conventions

- Deep endpoints, not shallow (P5.03) — each endpoint accepts a complete request and handles
  all internal orchestration (e.g. creating a Registration also creates the Payment record and
  triggers emails; the caller does not orchestrate three separate calls).
- All timestamps: ISO 8601, UTC.
- All monetary values: `numeric` in GHS, two decimal places, transmitted as JSON numbers.
- All list endpoints support pagination: `?page=1&limit=50` (default `limit=50`, max `200`).
- Every response includes `{ "data": ..., "error": null }` on success or
  `{ "data": null, "error": { "code": ..., "message": ... } }` on failure — never a bare object
  or bare array at the top level.

---

## 2. Endpoint: Create Registration

`POST /api/registrations`

**Auth:** None (public endpoint, `anon` role via RLS — Document 3, Section 7).

**Request body:**

```json
{
  "fullName": "Ama Owusu",
  "email": "ama.owusu@example.com",
  "phone": "+233241234567",
  "batchId": "b3f8b1a2-...-uuid",
  "leadSource": "WhatsApp",
  "consentGiven": true
}
```

**Validation (server-side, in addition to client-side):**

| Field | Rule | Failure response |
|---|---|---|
| `fullName` | Required, min 2 chars | 400 `VALIDATION_ERROR` |
| `email` | Required, valid email format | 400 `VALIDATION_ERROR` |
| `phone` | Required, min 10 chars | 400 `VALIDATION_ERROR` |
| `batchId` | Required, must be a valid UUID matching an Active batch with `start_date >= today` | 400 `INVALID_BATCH` |
| `leadSource` | Required, must be one of the 6 allowed values | 400 `VALIDATION_ERROR` |
| `consentGiven` | Required, must be `true` (BR-15) | 400 `CONSENT_REQUIRED` |

**Success response — 201:**

```json
{
  "data": {
    "registrationId": "a1b2c3d4-...-uuid",
    "registrationStatus": "Registered",
    "paymentStatus": "Unpaid",
    "message": "Thank you, Ama Owusu. Your registration for ICAG Level 1 Prep has been received. Please check your email for payment instructions."
  },
  "error": null
}
```

**Duplicate registration — 409:**

```json
{
  "data": null,
  "error": {
    "code": "DUPLICATE_REGISTRATION",
    "message": "You are already registered for this course intake. If you need help, please contact us."
  }
}
```

**Server-side orchestration (in order):**
1. Call `registrations.findOrCreateParticipant()` (BR-02).
2. Insert `registrations` row — database enforces BR-01 (active batch) and BR-03 (no
   duplicate) via triggers/constraints.
3. Insert `payments` row with `course_fee` copied from the Batch, `amount_paid = 0`.
4. Call `communications.sendEmailOnce(registrationId, 'welcome')`.
5. Call `communications.sendEmailOnce(registrationId, 'payment_instruction')`.
6. Call `communications.sendEmailOnce(registrationId, 'reminder_1')` (E03 — Section 12,
   PRD, fires immediately since Payment Status is Unpaid at creation).
7. Return success response. Steps 4–6 failures are logged to Sentry but do NOT fail the
   registration itself — a Participant's place is secured even if an email transiently
   fails to send (P4.01 — systems must work correctly even when things go wrong; email
   delivery failure must not block the core business transaction).

---

## 3. Endpoint: List/Get Registrations

`GET /api/registrations`

**Auth:** Staff session required. Role-based field filtering applied (see below).

**Query parameters:** `courseId`, `batchId`, `registrationStatus`, `paymentStatus`,
`leadSource`, `dateFrom`, `dateTo`, `search` (matches name/email/phone), `page`, `limit`.

**Role-based response shaping (enforced in the route handler, not RLS — see Document 3,
Section 6 column-level restriction flag):**

| Role | Fields included |
|---|---|
| `admin` | All fields including payment_notes, transaction_id, verified_by |
| `finance` | All fields (Finance's own domain) |
| `marketing` | All fields except `payment_notes`, `transaction_id`, `verified_by` |
| `tutor` | Only rows where `registration_status = 'Confirmed'` and batch belongs to them (RLS-filtered); fields: name, email, phone, batch, no payment fields at all |
| `management` | This endpoint is not used by Management — they use `/api/dashboard/summary` only |

**Success response — 200:**

```json
{
  "data": {
    "registrations": [
      {
        "id": "a1b2c3d4-...",
        "fullName": "Ama Owusu",
        "email": "ama.owusu@example.com",
        "phone": "+233241234567",
        "courseName": "ICAG Level 1 Prep",
        "courseCode": "ICAG-L1",
        "cohortLabel": "JUL-2026",
        "leadSource": "WhatsApp",
        "registrationStatus": "Registered",
        "paymentStatus": "Unpaid",
        "registeredAt": "2026-06-27T09:14:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 118 }
  },
  "error": null
}
```

---

## 4. Endpoint: Courses

`GET /api/courses` — **Auth:** Staff (all roles, read).
`POST /api/courses` — **Auth:** Staff, `admin` only.

**POST request body:**

```json
{ "courseCode": "ICAG-L1", "courseName": "ICAG Level 1 Prep" }
```

**Failure — non-admin attempts POST — 403:**

```json
{ "data": null, "error": { "code": "FORBIDDEN", "message": "Only Admin users can create courses." } }
```

**Failure — duplicate course code — 409:**

```json
{ "data": null, "error": { "code": "DUPLICATE_COURSE_CODE", "message": "A course with this code already exists." } }
```

---

## 5. Endpoint: Batches

`GET /api/batches?courseId=...` — **Auth:** Staff (all roles, read — Tutor sees own only via RLS).
`POST /api/batches` — **Auth:** `admin` only.
`PATCH /api/batches/[id]` — **Auth:** `admin` only.

**POST/PATCH request body:**

```json
{
  "courseId": "c1-uuid",
  "cohortLabel": "JUL-2026",
  "courseFee": 1200.00,
  "startDate": "2026-07-14",
  "startTime": "09:00",
  "endDate": "2026-07-18",
  "zoomLink": "https://zoom.us/j/...",
  "whatsappGroupLink": "https://chat.whatsapp.com/...",
  "facilitatorName": "Mr. Kwame Asante",
  "facilitatorStaffId": "staff-uuid-or-null",
  "welcomeEmailEnabled": true,
  "paymentReminderEnabled": true,
  "classReminderEnabled": true,
  "isActive": true
}
```

**Validation:** `startDate` must be ≤ `endDate`. `courseFee` must be ≥ 0. `courseId` must
reference an existing Course.

---

## 6. Endpoint: Update Payment

`PATCH /api/payments/[registrationId]`

**Auth:** Staff, `finance` or `admin` only.

**Request body (client sends only `amountPaid` and payment metadata — never `paymentStatus`,
per BR-04):**

```json
{
  "amountPaid": 1200.00,
  "paymentMethod": "Bank Transfer",
  "transactionId": "GCB-REF-88213",
  "paymentDate": "2026-07-10",
  "paymentNotes": "Confirmed against GCB statement, 10 Jul"
}
```

**Server-side orchestration:**
1. Verify session role is `finance` or `admin` — else 403.
2. Set `verified_by` server-side from session (`fn_current_staff_id()`), overriding any
   client-supplied value (BR-12).
3. Update `payments.amount_paid` and metadata fields. Database trigger derives
   `payment_status` (BR-04). If `payment_status` becomes `Paid`, database trigger updates
   `registration_status` to `Confirmed` (BR-06).
4. If `payment_status` became `Paid` in this request (compare before/after), call
   `communications.sendEmailOnce(registrationId, 'payment_confirmation')`.
5. Return the updated Payment record, including the derived `paymentStatus` and `balance`.

**Success response — 200:**

```json
{
  "data": {
    "registrationId": "a1b2c3d4-...",
    "amountPaid": 1200.00,
    "balance": 0.00,
    "paymentStatus": "Paid",
    "registrationStatus": "Confirmed",
    "verifiedBy": "Kofi Mensah (Finance)"
  },
  "error": null
}
```

**Rejected client-supplied paymentStatus — the API silently ignores it, does not error, and
logs a warning server-side (per BR-04's application constraint).**

---

## 7. Endpoint: Paystack Webhook

`POST /api/webhooks/paystack`

**Auth:** Paystack signature validation (BR-13). No user session — this is a server-to-server
call from Paystack's infrastructure.

**Incoming payload (abbreviated, Paystack's actual `charge.success` event shape):**

```json
{
  "event": "charge.success",
  "data": {
    "reference": "PSK-REF-99231",
    "amount": 120000,
    "channel": "card",
    "customer": { "email": "ama.owusu@example.com" },
    "metadata": { "registration_id": "a1b2c3d4-..." }
  }
}
```

⚠️ **`amount` is in kobo/pesewas (smallest currency unit) — divide by 100 to get GHS.**
`120000` → GHS 1,200.00.

**Required implementation detail:** The `metadata.registration_id` field must be populated
by the frontend at Paystack checkout initialisation — this is how the webhook knows which
Registration a payment belongs to. If the checkout initialisation does not pass this
metadata, the webhook cannot reliably match the payment (see EC-02, Document 4). **This is a
hard requirement on the Paystack checkout integration, not optional.**

**Response codes:**

| Scenario | HTTP status | Body |
|---|---|---|
| Invalid signature | 401 | `{ "error": "invalid_signature" }` |
| Valid, already processed (BR-14) | 200 | `{ "status": "already_processed" }` |
| Valid, registration_id not found (EC-02) | 200 | `{ "status": "unmatched_logged_for_review" }` |
| Valid, processed successfully | 200 | `{ "status": "processed", "paymentStatus": "Paid" }` |

**Paystack always receives 200 for any validly-signed and understood webhook**, even in the
unmatched case, to prevent Paystack's retry mechanism from repeatedly resending a webhook
that the system has already logged and cannot further act on without human intervention.

---

## 8. Endpoint: Cron Reminders

`GET /api/cron/reminders`

**Auth:** `Authorization: Bearer <CRON_SECRET>` header, set automatically by Vercel Cron and
validated against the `CRON_SECRET` environment variable. Any request without a matching
header returns 401 immediately.

**Response — 200:**

```json
{
  "data": {
    "date": "2026-07-10",
    "evaluated": 84,
    "sent": 12,
    "skippedDeduplicated": 68,
    "skippedPaidSinceQuery": 3,
    "skippedInactiveBatch": 1,
    "errors": []
  },
  "error": null
}
```

This response is for observability only (visible in Vercel function logs) — no external
caller consumes this response programmatically.

---

## 9. Endpoint: Participant Deletion

`POST /api/participants/[id]/delete`

**Auth:** `admin` only.

**Request body:**

```json
{ "reason": "Data subject erasure request received 2026-07-01" }
```

**Behaviour:** Calls `fn_soft_delete_participant()` (Document 3, Section 8). This is Step 1
(soft delete) only. Step 2 (hard delete) is a separate, deliberately manual admin action not
exposed as a simple one-click API in Phase 1 — it requires the 30-day minimum wait (BR
enforced at the database function level, Document 3 Section 8) and is triggered via a
distinct confirmation flow in the UI (Document 8).

**Success response — 200:**

```json
{ "data": { "participantId": "p-uuid", "softDeletedAt": "2026-07-01T14:22:00Z" }, "error": null }
```

---

## 10. Endpoint: Dashboard Summary

`GET /api/dashboard/summary`

**Auth:** `admin` or `management` only.

**Success response — 200:**

```json
{
  "data": {
    "courses": [
      {
        "batchId": "b-uuid",
        "courseName": "ICAG Level 1 Prep",
        "cohortLabel": "JUL-2026",
        "startDate": "2026-07-14",
        "totalRegistered": 30,
        "totalPaid": 22,
        "totalUnpaid": 6,
        "totalPartPayment": 2,
        "expectedRevenue": 36000.00,
        "revenueReceived": 27600.00,
        "outstandingBalance": 8400.00,
        "paymentConversionRate": 73.3
      }
    ],
    "aggregate": {
      "registrationsThisMonth": 118,
      "revenueReceivedThisMonth": 94200.00,
      "totalOutstandingBalance": 31200.00
    },
    "leadSources": [
      { "source": "WhatsApp", "count": 52, "conversionRate": 78.8 },
      { "source": "Facebook", "count": 34, "conversionRate": 61.7 }
    ]
  },
  "error": null
}
```

**All figures computed live** (Document 3, Section 2 — dashboard is derived data,
recomputed on every request, not cached in Phase 1).

---

## 11. Endpoint: Staff Users

`GET /api/users` / `POST /api/users` / `PATCH /api/users/[id]`

**Auth:** `admin` only for all three operations.

**POST request body:**

```json
{ "email": "kofi@business.com", "fullName": "Kofi Mensah", "role": "finance" }
```

**Note:** Creating a Staff User via this endpoint creates the corresponding Supabase Auth
user (invitation email sent by Supabase Auth) AND the `staff_users` row linking to it. This
is a two-step orchestration the endpoint performs atomically from the caller's perspective.

---

## 12. Error Response Standard

| HTTP Status | `error.code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed field validation |
| 400 | `CONSENT_REQUIRED` | DPA consent checkbox not confirmed (BR-15) |
| 400 | `INVALID_BATCH` | Batch does not exist, is inactive, or has passed |
| 401 | `UNAUTHENTICATED` | No valid session or signature |
| 401 | `invalid_signature` | Paystack webhook signature check failed |
| 403 | `FORBIDDEN` | Authenticated but role lacks permission |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `DUPLICATE_REGISTRATION` | BR-03 violation |
| 409 | `DUPLICATE_COURSE_CODE` | Course code uniqueness violation |
| 500 | `INTERNAL_ERROR` | Unhandled server error — logged to Sentry with request ID |

---

## 13. Ready for Development Checklist

```
□ 1. All 10 endpoints implemented exactly matching request/response shapes above.
□ 2. Registration endpoint orchestrates participant + registration + payment +
      3 initial emails as ONE deep operation (P5.03), not left to the caller.
□ 3. Role-based field filtering on GET /api/registrations implemented in the
      route handler — this is NOT covered by RLS alone (see Document 3 flag).
□ 4. PATCH /api/payments never accepts client-supplied paymentStatus or
      verifiedBy — both are server-derived (BR-04, BR-12).
□ 5. Paystack webhook: kobo-to-GHS conversion (÷100) implemented correctly.
□ 6. Paystack checkout initialisation passes registration_id in metadata —
      confirmed as a hard requirement for webhook matching (EC-02).
□ 7. Cron endpoint validates CRON_SECRET before any processing.
□ 8. Dashboard summary is computed live on every request — no caching layer
      introduced in Phase 1.
□ 9. Error response standard applied consistently across all endpoints.
□ 10. Next document to read: Document 6 — Security and Authentication Specification.
```

---

*Document 6 of 12: Security and Authentication Specification follows.*
