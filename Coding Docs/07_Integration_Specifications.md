# Centralised Course Registration & Follow-Up System
## Integration Specifications

---

| Field | Value |
|---|---|
| **Document** | Integration Specifications |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | AI Coding Agent |
| **Input from** | Document 5 (API Contract), Document 6 (Security) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Initial specification — Paystack, Resend, Supabase, Uptime Robot, Sentry |

---

## Table of Contents

1. [Paystack Integration](#1-paystack-integration)
2. [Resend Integration](#2-resend-integration)
3. [Supabase Integration](#3-supabase-integration)
4. [Uptime Robot Integration](#4-uptime-robot-integration)
5. [Sentry Integration](#5-sentry-integration)
6. [Idempotency Standard Across All Integrations](#6-idempotency-standard-across-all-integrations)
7. [Ready for Development Checklist](#7-ready-for-development-checklist)

---

## 1. Paystack Integration

**Purpose:** Card and MTN MoMo payment collection (DEC-007).

### 1.1 Checkout Initialisation (client-side)

```typescript
// components/PaystackCheckout.tsx
const config = {
  reference: `REG-${registrationId}-${Date.now()}`, // unique per attempt
  email: participantEmail,
  amount: courseFee * 100, // GHS to pesewas conversion
  publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
  metadata: {
    registration_id: registrationId, // REQUIRED — webhook match key, Document 5 Section 7
  },
  channels: ['card', 'mobile_money'], // Enables both Paystack Card and MTN MoMo
};
```

⚠️ **`metadata.registration_id` is not optional.** Omitting it breaks the webhook's ability
to match a payment to a Registration (EC-02, Document 4). This must be verified in testing
before go-live — send a test payment and confirm the webhook payload's
`data.metadata.registration_id` field is populated.

### 1.2 Webhook Endpoint Registration

The Paystack dashboard must be configured (manual, one-time setup, not code) with the
webhook URL: `https://[production-domain]/api/webhooks/paystack`. This must be done against
the **production** Vercel URL — Paystack webhooks configured against a Preview deployment
URL will stop working every time a new preview is generated. **This is a common
implementation error; confirm the webhook URL points to the stable production domain before
go-live testing.**

### 1.3 Retry Behaviour

Paystack retries a webhook if it does not receive an HTTP 200 response within its timeout
window, using an exponential backoff over several attempts across roughly 72 hours. This is
precisely why BR-14's idempotency guarantee (Document 4) is not optional — retries are
expected and normal, not a failure condition.

### 1.4 Bank Transfer (non-API path)

Bank transfers do not flow through Paystack at all — they are a manual Finance workflow
(Document 5, Section 6; Document 4, BR-12). No Paystack integration code is involved in the
bank transfer path.

---

## 2. Resend Integration

**Purpose:** All transactional email delivery (DEC-006).

### 2.1 Setup Requirements (manual, before go-live)

1. Verify a sending domain in the Resend dashboard (e.g. `mail.yourbusiness.com`) — this
   requires adding DNS records (SPF, DKIM) at the domain registrar. **This step has a
   propagation delay of up to 48 hours and must be started well before the go-live date, not
   on the day of launch.**
2. Generate an API key scoped to sending only (not full account access).

### 2.2 Client Implementation

```typescript
// lib/resend/client.ts
import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
```

### 2.3 Template Rendering

Templates (stored in `email_templates`, Document 3) use `{{placeholder}}` syntax (Document
1, Section 12). Rendering is a simple string-replace operation — no templating engine
dependency is required for this level of complexity:

```typescript
function renderTemplate(templateBody: string, data: Record<string, string>): string {
  return templateBody.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] ?? match);
}
```

### 2.4 Failure Handling

If `resend.emails.send()` throws (network error, invalid recipient, rate limit), the
`email_log` row is updated with `success = false` and the error message (Document 4, BR-07
implementation). The calling business operation (e.g. registration creation) does not fail
as a result — per Document 5, Section 2, step 7.

### 2.5 Volume Monitoring

Resend's dashboard shows monthly send volume against the 3,000/month free tier. **The Admin
should check this monthly** — no automated alert is built for this in Phase 1 (a Phase 2 or
Phase 3 addition if volume growth warrants it). Projected volume is ~960/month combined
Phase 1+2 (Document 1, Section 4.4 discovery research) — comfortable headroom.

---

## 3. Supabase Integration

**Purpose:** Database, Auth, and RLS enforcement (DEC-004, DEC-005).

### 3.1 Client Instances

Three distinct client configurations are required — using the wrong one in the wrong
context is a security risk (Document 6, Section 5):

| Client | File | Uses | Bypasses RLS? |
|---|---|---|---|
| Browser client | `lib/supabase/client.ts` | Client components, uses anon key | No |
| Server client (session-aware) | `lib/supabase/server.ts` | Server components, API routes handling staff requests, uses anon key + user's session cookie | No — RLS applies per the authenticated user |
| Service role client | Used only inside `modules/communications/repository.ts` (email_log writes), the cron route, and the webhook handler | Uses `SUPABASE_SERVICE_ROLE_KEY` | **Yes — RLS is bypassed entirely** |

⚠️ **The service role client must never be instantiated in any file reachable from a client
component or a public API route that accepts arbitrary user input without prior
authorization checks.** Its use is limited to the three contexts listed above, each of which
has its own independent authorization check (cron secret, webhook signature, or is called
only from already-authorized server-side module code).

### 3.2 Realtime (not used in Phase 1)

Supabase Realtime subscriptions are available but not used — the Dashboard (F1.08) is
computed on page load/refresh, not live-updating. This avoids unnecessary complexity per
PX.02; it can be added in a later phase if the Admin wants live updates without a manual
refresh.

### 3.3 Inactivity Pause Mitigation

Per Document 2 (DEC-004's known risk, RISK-P03): a Supabase free-tier project pauses after
7 days without a database request. Uptime Robot (Section 4 below) prevents this by pinging
a lightweight health-check endpoint every 5 minutes, which triggers a database query and
resets the inactivity timer.

```typescript
// app/api/health/route.ts — pinged by Uptime Robot
export async function GET() {
  const supabase = createServerClient();
  const { error } = await supabase.from('courses').select('id').limit(1);
  return Response.json({ status: error ? 'error' : 'ok' });
}
```

---

## 4. Uptime Robot Integration

**Purpose:** Prevent Supabase inactivity pause; secondary benefit of uptime visibility
(DEC-010).

**Setup (manual, no code beyond the health-check endpoint above):**
1. Create a free Uptime Robot account.
2. Add an HTTP(s) monitor pointing to `https://[production-domain]/api/health`.
3. Set check interval to 5 minutes (free tier default).
4. Configure an email alert to the founder if the endpoint is down for more than one check
   interval.

This is entirely external configuration — no application code beyond the health-check route
itself is required.

---

## 5. Sentry Integration

**Purpose:** Error tracking (DEC-011).

### 5.1 Setup

```bash
npx @sentry/wizard@latest -i nextjs
```

This wizard-based setup wraps the Next.js configuration automatically. The agent should run
this rather than hand-writing Sentry configuration, to ensure compatibility with the current
Sentry Next.js SDK version.

### 5.2 What Must Be Captured

| Event | Capture requirement |
|---|---|
| Any unhandled exception in an API route | Automatic via Sentry's Next.js integration |
| Paystack webhook processing failure | Explicit `Sentry.captureException()` call with `registration_id` and `paystack_reference` as tags, for fast lookup during a payment dispute |
| Email send failure (from `email_log.success = false`) | Not sent to Sentry individually (would be noisy at 960/month volume with expected occasional transient failures) — instead, a weekly summary is available by querying `email_log where success = false`, reviewed manually by the Admin |
| Reminder cron job failures | Explicit `Sentry.captureException()` — a failed cron run affects many participants at once and must be visible immediately |

### 5.3 PII Scrubbing

Sentry's default configuration may capture request bodies, which include participant PII
(name, email, phone). Per Ghana DPA data minimisation (Document 1, Section 14.1), configure
Sentry's `beforeSend` hook to scrub `email`, `phone`, and `fullName` fields from any
captured event payload before it leaves the application:

```typescript
// sentry.server.config.ts
Sentry.init({
  // ...
  beforeSend(event) {
    if (event.request?.data) {
      ['email', 'phone', 'fullName', 'full_name'].forEach((field) => {
        if (event.request!.data[field]) event.request!.data[field] = '[SCRUBBED]';
      });
    }
    return event;
  },
});
```

---

## 6. Idempotency Standard Across All Integrations

Per P4.25 — exactly-once processing is achieved end-to-end, never assumed from the
transport layer alone. Summary across all three external integrations that can retry or
duplicate-deliver:

| Integration | Can it retry/duplicate? | Idempotency mechanism |
|---|---|---|
| Paystack webhook | Yes — documented retry behaviour (Section 1.3) | `unique(transaction_id)` constraint (BR-14) |
| Resend send | No automatic retry from Resend on the application's side, but the application itself may retry a failed cron pass | `unique(registration_id, email_type)` on `email_log` (BR-07), reserved before send |
| Vercel Cron | Vercel does not duplicate-trigger under normal operation, but manual re-runs during testing/recovery are expected | Same `email_log` mechanism — cron re-runs are always safe (Document 2, Section 7) |

---

## 7. Ready for Development Checklist

```
□ 1. Paystack checkout metadata.registration_id confirmed present in a live
      test transaction before go-live.
□ 2. Paystack webhook URL registered against the production Vercel domain,
      not a Preview URL.
□ 3. Resend sending domain DNS verification started at least 48 hours
      before the planned go-live date.
□ 4. Three distinct Supabase client configurations implemented correctly;
      service role client usage audited and confirmed limited to cron,
      webhook, and communications repository only.
□ 5. /api/health endpoint created and confirmed reachable before
      configuring Uptime Robot.
□ 6. Uptime Robot monitor configured at 5-minute intervals against the
      production health endpoint.
□ 7. Sentry installed via the official wizard, not hand-configured.
□ 8. Sentry beforeSend PII scrubbing implemented and verified with a test
      exception containing sample participant data.
□ 9. Idempotency mechanism confirmed present for all three external
      integrations capable of retry or duplicate delivery.
□ 10. Next document to read: Document 8 — UI/UX Screen Specification.
```

---

*Document 8 of 12: UI/UX Screen Specification follows.*
