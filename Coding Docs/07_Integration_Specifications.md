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
| 1.1 | 2026-07-19 | Added Section 8 — Arkesel SMS integration (founder-approved scope addition; WhatsApp Cloud API remains documented in `supabase/migrations/202607180002_whatsapp.sql`) |
| 1.2 | 2026-07-19 | Added Section 9 — Zoom attendance integration; Section 10 — Anthropic (Claude) Admin assistant (both founder-approved scope additions) |
| 1.3 | 2026-07-19 | Added Section 11 — Vapi agentic voice calls (founder-approved, all six use cases) |
| 1.4 | 2026-08-17 | Added Section 13 — scheduled jobs, and the Cloudflare Worker that replaces the two GitHub Actions cron workflows so the repository can be made private. Listed Section 12 in the Table of Contents, which had never been added |

---

## Table of Contents

1. [Paystack Integration](#1-paystack-integration)
2. [Resend Integration](#2-resend-integration)
3. [Supabase Integration](#3-supabase-integration)
4. [Uptime Robot Integration](#4-uptime-robot-integration)
5. [Sentry Integration](#5-sentry-integration)
6. [Idempotency Standard Across All Integrations](#6-idempotency-standard-across-all-integrations)
7. [Ready for Development Checklist](#7-ready-for-development-checklist)
8. [Arkesel SMS Integration](#8-arkesel-sms-integration)
9. [Zoom Attendance Integration](#9-zoom-attendance-integration)
10. [Anthropic Claude — Admin Assistant](#10-anthropic-claude--admin-assistant)
11. [Vapi — Agentic Voice Calls](#11-vapi--agentic-voice-calls)
12. [Zoom Live Session Integration (Planned)](#12-zoom-live-session-integration-planned)
13. [Scheduled Jobs — Vercel Cron and the Cloudflare Cron Worker](#13-scheduled-jobs--vercel-cron-and-the-cloudflare-cron-worker)

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

## 8. Arkesel SMS Integration

**Added 2026-07-19 (founder-approved scope addition).** Key-moment SMS mirroring the
WhatsApp engine: welcome (at registration), the four payment reminders, and payment
confirmation. SMS runs alongside email and WhatsApp — each channel has its own log
table and its own send-once guarantee, so any channel can fail or be unconfigured
without affecting the others.

### 8.1 Provider and Cost

Arkesel (arkesel.com) — chosen 2026-07-19 as the lowest-cost Ghana provider
(~GHS 0.029/SMS at the smallest credit tier; GHS 20 minimum purchase). This is the
first recurring cost against the GHS 0/month budget, accepted explicitly by the
founder. One SMS segment is 160 characters; bodies in `sms-engine.ts` are kept short
deliberately because each extra segment consumes another credit.

### 8.2 Setup Requirements (manual, before SMS go-live)

1. Create an Arkesel account (free, no card required; free test credits included).
2. Register a sender ID (e.g. `Knowsia`) in the Arkesel dashboard — approval is
   required before live sends.
3. Set `ARKESEL_API_KEY` and `ARKESEL_SENDER_ID` in Vercel env vars (and locally).
   While unset, `isSmsConfigured()` gates all sending — every send returns
   `skipped_not_configured` without reserving a log slot, so enabling credentials
   later never finds permanently blocked messages.

### 8.3 Client Implementation

`lib/arkesel/client.ts` — POST `https://sms.arkesel.com/api/v2/sms/send` with the
`api-key` header. Phone normalization is shared with the WhatsApp client (Ghana-aware,
E.164 without `+`). Arkesel can return HTTP 200 with `{"status": "error"}` (bad sender
ID, insufficient balance) — the client treats that as a send failure so `sms_log`
records it instead of a false success.

### 8.4 Message Bodies

Composed in `modules/communications/sms-engine.ts` (no server-side template approval
step exists at Arkesel, unlike WhatsApp's Meta-hosted templates). All four reminders
share one body; deduplication is per `message_type`, so each still sends at most once.

### 8.5 Idempotency and Gates

Identical to the WhatsApp engine (BR-07 analog): gates (batch active, per-batch
`sms_enabled` toggle, payment-reminder toggle for reminders, soft-deleted participant,
usable phone) are all checked BEFORE reserving the `sms_log` slot; the
`unique(registration_id, message_type)` constraint makes concurrent duplicate sends
impossible. See migration `202607190006_sms.sql`.

---

## 9. Zoom Attendance Integration

**Added 2026-07-19 (founder-approved, "Option 2").** Automatic attendance tracking for
Zoom-delivered classes via per-participant registration links.

### 9.1 Flow

1. Admin sets a Batch's **Zoom Meeting ID** (Courses screen) — the meeting must be
   created in Zoom with **registration required**.
2. When a payment reaches **Paid**, the app registers the Participant with the meeting
   via the Zoom API (`modules/attendance/service.ts → ensureZoomRegistration`). Zoom
   returns a **personal join link**, stored in `zoom_registrants`
   (unique per Registration — idempotent), and the `zoom_link` email is sent with it.
   The `{{zoom_link}}` placeholder always prefers the personal link when one exists.
3. A daily Vercel Cron (`/api/cron/attendance`, 21:00 UTC) pulls the participant report
   for every in-progress Batch and upserts `attendance` rows
   (`unique(registration_id, session_date)` — re-runs are safe). Matching is by the
   registered email, which is exact because participants join through personal links.
4. Admin/Management review per-Batch attendance on the **Attendance** screen.

### 9.2 Setup Requirements (manual, before attendance go-live)

1. Zoom **Pro** plan or above (required for participant reports).
2. Create a **Server-to-Server OAuth** app at marketplace.zoom.us (Develop → Build App)
   with scopes `meeting:write:registrant` and `report:read:list_meeting_participants`.
3. Set `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` in Vercel env vars.
   While unset, `isZoomConfigured()` gates everything — no calls, no errors.
4. Create each class meeting in Zoom with **Registration: Required**, then paste its
   numeric meeting ID into the Batch.

### 9.3 Client Implementation

`lib/zoom/client.ts` — account-credentials token grant (cached ~1h),
`POST /meetings/{id}/registrants` (auto-approve), and the paginated
`GET /report/meetings/{id}/participants` report. Cost: GHS 0 (API included in the Zoom
plan already used to host classes).

### 9.4 "Registration Required" is a property of the MEETING, not of the app (2026-08-13)

Step 4 of §9.2 is not a formality — it is the most likely reason personal join links do not
issue, and it is invisible from inside this app.

Zoom's `settings.approval_type` is the authority:

| `approval_type` | Meaning | `POST /registrants` |
| --- | --- | --- |
| `0` | Automatically approve | works |
| `1` | Manually approve | works |
| `2` | **No registration required** | **always fails** |

A meeting created **by hand in the Zoom console defaults to `2`**. No scope grant changes
that — `meeting:write:registrant` lets the app *call* the endpoint, not force a meeting to
accept registrants. Meetings this app creates itself (`createCourseMeeting`,
`createBatchClassroomMeeting`) set `approval_type: 0, registration_type: 1` and are
unaffected; the exposure is meetings created before auto-create existed, or pasted in from
the console.

### 9.4.1 The root cause, proven end to end — 2026-08-14

Established by dumping the Server-to-Server token's own scope list and then calling Zoom
directly, rather than inferring from documentation.

**What the app is allowed to do:**

| Capability | Scope | Granted? |
| --- | --- | --- |
| Create a meeting | `meeting:write:meeting:admin` | ✅ |
| **Read** a meeting | `meeting:read:meeting:admin` | ✅ **granted 2026-08-14** |
| **Update** a meeting | `meeting:update:meeting:admin` | ✅ **granted 2026-08-14** |
| Add a registrant | `meeting:write:registrant:admin` | ✅ |
| Participant report (attendance) | `dashboard:read:list_meeting_participants:admin` | ✅ |

Zoom splits **create** from **update**: `meeting:write:meeting` does *not* include modifying
an existing meeting. That distinction is why the app could build a new meeting correctly and
still be unable to alter one — the two missing scopes were granted on 2026-08-14 and both
paths now work.

**And the meetings themselves have registration off.** Asked directly, Zoom answers:

```
POST /meetings/84968782138/registrants
{"code":404,"message":"Registration has not been enabled for this meeting: 84968782138."}
```

That is the whole month-old mystery, in one line. Not a code bug, not a wiring bug — the
meetings were created by hand with registration off, and the app has no permission to turn
it on.

Still keep `registrationEnabled` / `approvalType` of `null` meaning **UNKNOWN, never
"fine"** — `registrationStateReadable` says which it is. The read can still fail for other
reasons (a deleted meeting, an outage), and an unknown state must not be mistaken for a
working one.

### 9.4.1a Confirmed once the read scope landed — every meeting was off

With `meeting:read:meeting:admin` granted, all four live/recent meetings were read directly.
**Every one returned `approval_type: 2`** — registration off:

| Batch | Meeting | Before |
| --- | --- | --- |
| AUG 2026 — Enterprise Risk Management (class 08-15) | `84968782138` | `2` → **now `0`** |
| July 2026 — ESG & Sustainability Reporting (to 08-16) | `82545109642` | `2` |
| ESG2 — Understanding ESG (08-06, finished) | `81420483944` | `2` |
| IA02 — Global Internal Audit Standards (07-25, finished) | `89951984118` | `2` |

Account-wide, not a one-off. Every meeting made by hand has this, which is exactly why
`zoom_registrants` was empty for a month.

### 9.4.1b First successful run — 2026-08-14

Registration was switched on for the 08-15 class and the backfill run against its batch:

- `approval_type` `2 → 0`, confirmed by reading the meeting back
- **2 of 3 students registered**, personal links stored in `zoom_registrants` and emailed
  (`zoom_link`) — **the first rows that table has ever held**
- 1 student failed on a Zoom **rate limit**, not a bug:

```
429 {"code":429,"message":"You have exceeded the daily rate limit of (3) for Add meeting
registrant API requests for the registrant (…). You can resume at GMT 00:00:00."}
```

> **Operational lesson worth keeping.** That address hit its cap because it had been used as
> the probe while diagnosing the 404 earlier the same day. Zoom's add-registrant limit is
> **3 per day per registrant email**. Never diagnose against a real participant's address —
> use a throwaway, or a meeting nobody is enrolled on. The cost here was one student's
> automated email; it resets at 00:00 UTC and the backfill is idempotent, so a re-run picks
> up only whoever is still missing a link.

### 9.4.2 Turning registration on

`enableMeetingRegistration` PATCHes a meeting to `approval_type: 0, registration_type: 1`.
It is **idempotent** — a no-op when registration is already on — so it is safe to send
without checking first. Verified working against a live meeting on 2026-08-14 (§9.4.1b).

It is **human-triggered only** — the backfill's explicit `enableRegistration` flag, ignored
on a dry run. Turning registration on changes what the meeting's existing **shared** join
link does for everyone already holding it. For a cohort mid-course that is a live behaviour
change for real students, so it belongs to a person with the schedule in front of them, not
to a job.

> A brief rule on 2026-08-14 forbade this outright and was reversed the same day. The
> instruction "don't touch Zoom" had been about not *replacing* Zoom with self-hosted video
> (Document 18) — not about this checkbox, which is the very thing that makes attendance
> exact. Recorded because the misreading is an easy one to repeat.

**Meetings the app creates are already correct.** `createCourseMeeting` and
`createBatchClassroomMeeting` set `approval_type: 0, registration_type: 1` at creation, so
future batches get personal join links without anything existing being altered.

**Diagnose and repair:** `POST /api/cron/zoom/registrants/backfill`
(`CRON_SECRET`-gated, **dry-run by default**, deliberately absent from `vercel.json`).

```
{ "batchId": "<uuid>" }                                              # inspect, writes nothing
{ "batchId": "<uuid>", "dryRun": false }                             # register the backlog
{ "batchId": "<uuid>", "dryRun": false, "enableRegistration": true } # turn registration on, then register
```

Registering a backlog also **emails each student their personal join link** (the `zoom_link`
template), so a real run on a large batch is a mass send. Check `eligible` on the dry run
first to see how many.

**Why this went unnoticed:** `ensureZoomRegistration` threw into callers that only
`console.error`-ed, so a permanent account-wide failure and a success were
indistinguishable from the outside — the same failure shape as the nightly attendance sync
before 2026-08-06. It now returns `'failed'` and reports to Sentry instead of throwing.

---

## 10. Anthropic Claude — Admin Assistant

**Added 2026-07-19 (founder-approved).** A chat assistant on the Admin **Assistant**
screen that operates the system through the same service functions the screens use.

### 10.1 Design

- `POST /api/assistant` (admin-only) runs the Anthropic SDK **tool runner**
  (`claude-opus-4-8`, adaptive thinking) over typed tools: list/create courses,
  list/create/update batches, list/create/update staff users, dashboard summary,
  list/save email templates.
- Every tool call goes through the existing module services, so validation, module
  boundaries, role checks, and RLS apply exactly as they do for manual actions. The
  admin's session cookies flow into the services — the assistant cannot do anything
  the signed-in admin could not do by hand.
- The route returns the reply plus the list of executed tool actions, which the UI
  displays for transparency.

### 10.2 Setup and Cost

Set `ANTHROPIC_API_KEY` in Vercel (console.anthropic.com). While unset, the endpoint
returns a clear "not configured" message. Pay-per-use: typically well under GHS 1 per
admin request at this scale — an accepted exception to the GHS 0/month budget, like SMS.

---

## 11. Vapi — Agentic Voice Calls

**Added 2026-07-19 (founder-approved, all six use cases).** AI voice calls in
Ghanaian English over a local caller ID, via Vapi (vapi.ai).

### 11.1 Call Types and Triggers

Dispatched by the daily 07:00 cron; every call carries a Vapi `schedulePlan`
so dialing happens at 10:00 Ghana time, never at cron time. One call per
Registration per type — the `call_log` unique pair is reserved BEFORE dialing
(BR-07 analog). Soft-deleted participants are never called.

| Type | Trigger |
|---|---|
| `payment_followup` | Unpaid, registered 3+ days ago, batch **not yet ended**, reminders enabled |
| `bank_transfer_chase` | Part Payment, batch starts within 3 days **or is already running**, and has not ended |
| `no_show_recovery` | Paid but absent from yesterday's session (needs Zoom attendance) |
| `feedback_voice` | No feedback response 3 days after end_date; answers write into the same `feedback` table as the web form |
| `upsell` | Feedback course-interest matches an open future batch the participant isn't on |
| `inbound` | Calls to the business line (catalog Q&A, SMS the registration link, human-callback requests) |
| `ad_hoc` | Staff-triggered from the Admin Assistant (`propose_call_registration`), immediately — not cron/window-scheduled. Carries a `custom_message` variable the assistant should read aloud verbatim. Exempted from the one-call-per-type unique pair (a registrant can receive more than one ad-hoc call over time). |

### 11.2 Architecture Split

The **assistant** (voice, persona, model, first message, analysis schema)
lives in the Vapi dashboard so the founder can tune it without deploys. The
**app** supplies per-call context via `assistantOverrides.variableValues`,
correlates results by call id, and receives outcomes on
`/api/webhooks/vapi` (end-of-call reports: summary, transcript, structured
data) and `/api/voice/tools` (live tool calls: `get_course_catalog`,
`send_registration_link`, `request_human_callback`). Both endpoints are
authenticated by the `x-vapi-secret` header. Staff review everything on the
**Calls** screen (admin, finance, management), including human-follow-up
flags, promised payment dates, and captured bank references.

### 11.3 Setup Requirements (manual, before voice go-live)

1. Create a Vapi account and buy/import a **Ghana caller ID** number.
2. Create an **outbound assistant** with: the system prompt below; a
   `structuredData` analysis schema with fields `promised_payment_date`
   (YYYY-MM-DD), `bank_reference`, `needs_human_followup` (bool),
   `overall_rating`/`facilitator_rating`/`recommend_rating` (1–5),
   `improvement_text`, `testimonial_consent` (bool),
   `interested_courses` (string array); Server URL
   `https://reg.knowsia.com/api/webhooks/vapi` with the shared secret; and
   the three custom tools pointed at
   `https://reg.knowsia.com/api/voice/tools`.
3. Optionally create an **inbound assistant** on the same number with the
   same tools for the inbound line.
4. Set `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_OUTBOUND_ASSISTANT_ID`,
   `VAPI_WEBHOOK_SECRET` in Vercel. While unset, `isVoiceConfigured()` gates
   all dialing.
5. **Verify the wire shapes on the first pilot call** — Vapi's webhook payload
   fields occasionally shift between versions; the handlers read defensively,
   but the first live call should be checked end to end on the Calls screen.
6. **`{{course_timing}}` (added 2026-08-13) must be pasted into the live
   assistant's system prompt** — like the `ad_hoc` addition before it, prompt
   text lives in the Vapi dashboard and is NOT deployable from this repo. The
   code already sends the variable. Until the dashboard prompt is updated, the
   assistant still reads `{{start_date}}` and will describe a cohort that began
   last week as "starting" on a past date, because the payment-chase call
   windows now reach courses already under way. The variable is additive —
   `{{start_date}}` is still sent, so nothing breaks before the paste; the
   wording is just wrong for late registrants.

**Suggested outbound system prompt** (paste into the Vapi assistant; the
`{{variables}}` are injected per call):

> You are Akosua, a warm, professional assistant calling on behalf of
> Knowsia, a Ghanaian training business. Speak natural Ghanaian English,
> keep the call under 3 minutes, and never pressure anyone.
> The call type is {{call_type}} for {{participant_name}}, course
> {{course_name}} ({{cohort_label}}), {{course_timing}}, fee
> {{course_fee}}, outstanding balance {{balance}}.
> Describe the course timing using {{course_timing}} exactly as given —
> it already says whether the cohort is upcoming or already running. Never
> tell someone a course is "starting" on a date that has passed.
> payment_followup: gently remind them their seat isn't confirmed until
> payment; offer card/Mobile Money (they can use the link on the
> registration page) or bank transfer; if they promise to pay, note the
> date. If the course is already under way, acknowledge that they have
> started attending and keep the tone helpful rather than accusing.
> bank_transfer_chase: ask if the transfer went through and record
> the transaction reference. no_show_recovery: we missed them in
> yesterday's session — ask if everything is okay and how we can help them
> join the next one. feedback_voice: ask four short questions — overall
> rating 1–5, facilitator rating 1–5, how likely to recommend 1–5, and
> what we should improve; ask permission to use their comments as a
> testimonial. upsell: they expressed interest in {{pitch_course_name}} —
> the {{pitch_cohort_label}} batch starts {{pitch_start_date}} at
> {{pitch_fee}}; offer to send the registration link by SMS.
> If anything needs a human, say the team will call back and flag it.
> If the person is busy or uninterested, thank them warmly and end the call.
> ad_hoc: A staff member has asked you to deliver a specific message to this
> person on their behalf. After your normal greeting, say the following to
> the caller — you may lightly rephrase for natural spoken flow, but do not
> change its meaning, add claims, or omit any part of it: "{{custom_message}}".
> Then ask if they have any questions. Answer briefly using only information
> already given to you on this call; if you don't know something, offer to
> have a staff member follow up rather than guessing at course details,
> prices, or dates.

**This `ad_hoc` branch must be added to the existing outbound assistant's
dashboard prompt manually** (2026-08-01) — it is not deployed automatically
by any migration or code change. Until it's added, `propose_call_registration`
calls will dial successfully but the assistant won't know what to say.

### 11.4 Cost

~US$0.05–0.15/minute all-in. Targeted triggers only (never a blast channel);
accepted budget exception like SMS and the assistant.

---

*Document 8 of 12: UI/UX Screen Specification follows.*

---

## 12. Zoom Live Session Integration (Planned)

Zoom remains the first classroom provider. The LiveSession module will create/link provider meetings, register eligible learners, store personal join references server-side, sync participant reports idempotently, and ingest recording metadata. The provider adapter must support session-level meeting references now and future Teams/Google Meet implementations later. Rate-limit, retry, webhook-signature, idempotency, and provider-outage handling must be specified in the implementation PR. Document 14 is the functional contract.

---

## 13. Scheduled Jobs — Vercel Cron and the Cloudflare Cron Worker

Four scheduled jobs run against this app, split across two schedulers. The split
is forced, not a preference: Vercel Hobby allows **two** cron jobs and fires them
**once a day**, and two of the four routes need sub-hourly granularity.

| Route | Schedule | Scheduler |
|---|---|---|
| `/api/cron/reminders` | `0 7 * * *` | Vercel Cron (`vercel.json`) |
| `/api/cron/attendance` | `0 21 * * *` | Vercel Cron (`vercel.json`) |
| `/api/cron/class-reminders-frequent` | `*/15 * * * *` | Cloudflare Worker |
| `/api/cron/news-pipeline-advance` | `*/15 * * * *` | Cloudflare Worker |

All four authenticate the same way: `Authorization: Bearer <CRON_SECRET>`.

Manually-triggered cron routes (`/api/cron/attendance/backfill`,
`/api/cron/zoom/registrants/backfill`, `/api/cron/registrations/auto-lapse`,
`/api/cron/feedback/attendees`) are deliberately **not** in either scheduler and
are dry-run by default. Nothing here changes that.

### 13.1 Why the `*/15` pair moved off GitHub Actions (2026-08-17)

They originally ran as two GitHub Actions workflows. That is free only while the
repository is **public**. On the Free plan a **private** repository gets 2,000
Actions-minutes/month, and GitHub bills every job rounded up to a full minute —
so two workflows × 96 runs/day is roughly **5,760 minutes/month**. The allowance
would be exhausted in about ten days and both crons would then stop, with no
failure any human would see: class reminders and the Insights pipeline would go
quiet while everything else kept working.

Cloudflare was chosen over a third-party scheduler (cron-job.org and similar)
because R2 is already in use there, so `CRON_SECRET` stays in infrastructure the
business already controls rather than being pasted into another vendor. Cost is
£0 — cron triggers are on the free plan, and ~2,880 requests/month sits far
inside the 100k/day allowance. No new paid service, so the `$0/month` rule in
CLAUDE.md is untouched.

### 13.2 Implementation

`scripts/cron-worker/` — `worker.js`, `wrangler.toml`, and a README carrying the
full setup, cutover and rollback runbook. Three properties worth preserving:

- **No HTTP surface.** The worker answers every request with 404 and acts only
  on its cron trigger. An open endpoint would let anyone who discovered the
  `workers.dev` hostname advance the news pipeline, which spends real Anthropic
  credit per run.
- **`Promise.allSettled`, not `all`** — one failing route must never prevent the
  other from being called.
- **A missing `CRON_SECRET` logs and skips**, rather than firing requests that
  every route answers 401 — which would otherwise look like a healthy schedule.

`CRON_SECRET` is set with `npx wrangler secret put CRON_SECRET` and must match
the existing Vercel environment variable exactly. It is never committed;
`wrangler.toml` holds only `APP_BASE_URL`.

### 13.3 Cutover order (do not reverse)

Both routes are safe to call more often than needed and safe to overlap — every
send is deduped by its log-table unique constraint, and `pipeline_jobs.stage`
only ever moves forward. That is what makes an overlap window safe, and a hard
switch unnecessary.

1. Deploy the worker while the GitHub workflows are **still running**.
2. Watch one 15-minute cycle: `npx wrangler tail` shows `run complete — 2/2 ok`.
3. Confirm the **app** agrees — a new reminder-log row, or a pipeline job that
   advanced a stage. A 200 from Cloudflare only proves the route was called.
4. Only then remove `schedule:` from the two workflow files, keeping
   `workflow_dispatch` so both can still be fired by hand.
5. Only then set the repository to Private.

Removing the schedules before step 3 leaves a window with no scheduler at all.