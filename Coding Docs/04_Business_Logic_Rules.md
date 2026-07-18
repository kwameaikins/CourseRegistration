# Centralised Course Registration & Follow-Up System
## Business Logic Rules Document

---

| Field | Value |
|---|---|
| **Document** | Business Logic Rules Document |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | AI Coding Agent |
| **Input from** | Document 1 (PRD Section 11), Document 3 (Data Schema) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Full expansion of BR-01 through BR-19 with concurrency control and edge cases |

---

## Table of Contents

1. [Concurrency Control Standard](#1-concurrency-control-standard)
2. [Rule-by-Rule Specification](#2-rule-by-rule-specification)
3. [Edge Cases](#3-edge-cases)
4. [Ready for Development Checklist](#4-ready-for-development-checklist)

---

## 1. Concurrency Control Standard

Per P4.21 — "ACID" alone is not a specification. Every read-then-write business rule below
states its concurrency control explicitly.

| Concurrency pattern | Used for | Mechanism |
|---|---|---|
| Database constraint (not application check) | BR-03, BR-07, BR-14 | Unique constraints — the database itself rejects the duplicate, regardless of race conditions between concurrent requests |
| Database trigger (not application logic) | BR-04, BR-06 | Postgres triggers run inside the same transaction as the write, eliminating any window for a race condition |
| Row-level lock via `SELECT ... FOR UPDATE` | BR-08 (reminder cancellation check) | The cron job's read-then-decide must lock the payment row for the duration of its check to prevent a payment confirming mid-reminder-send |
| Idempotency key (application + database) | BR-14 (webhook) | Combination of database unique constraint (hard guarantee) and application-level pre-check (fast-path, avoids unnecessary work) |

---

## 2. Rule-by-Rule Specification

### BR-01 — No registration for an Inactive Batch

**Owning aggregate:** Registration (root)
**Concurrency control:** Application-level check before insert, backed by a database
`CHECK` via a `BEFORE INSERT` trigger for defence in depth.

```sql
create or replace function fn_prevent_inactive_batch_registration()
returns trigger as $$
declare
    v_is_active boolean;
begin
    select is_active into v_is_active from batches where id = new.batch_id;
    if not v_is_active then
        raise exception 'Cannot register for an inactive batch';
    end if;
    return new;
end;
$$ language plpgsql;

create trigger trg_prevent_inactive_batch_registration
before insert on registrations
for each row execute function fn_prevent_inactive_batch_registration();
```

**Application-level UX:** The registration form's Batch dropdown only lists Active batches
(BR-19), so a legitimate user never encounters this trigger in normal use. The trigger exists
as defence against direct API calls bypassing the form.

---

### BR-02 — Participant matched by email

**Owning aggregate:** Participant (standalone)
**Concurrency control:** `INSERT ... ON CONFLICT (email) DO UPDATE` — an atomic
upsert, eliminating the race condition of two simultaneous registrations from the same new
email both trying to create a Participant row.

```typescript
// modules/registrations/repository.ts
async function findOrCreateParticipant(data: ParticipantInput): Promise<Participant> {
  const { data: participant, error } = await supabase
    .from('participants')
    .upsert(
      { email: data.email.toLowerCase(), full_name: data.fullName, phone: data.phone },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) throw error;
  return participant;
}
```

**Note:** `upsert` with `ignoreDuplicates: false` updates `full_name` and `phone` on repeat
registration — this means a returning Participant's contact details are refreshed to their
latest submission, which is the correct behaviour (their most recent contact info is the
most accurate).

---

### BR-03 — No duplicate registration for the same Batch

**Owning aggregate:** Registration (root)
**Concurrency control:** Database unique constraint `unique(participant_id, batch_id)` —
see Document 3, Section 4. This is the authoritative guarantee, not an application-level
check, because two simultaneous form submissions from the same participant (e.g. double-
clicking submit) must be handled correctly regardless of timing.

**Application behaviour:** Catch the unique constraint violation (Postgres error code
`23505`) and return the user-facing message specified in PRD F1.01: "You are already
registered for this course intake."

---

### BR-04 — Payment Status derivation

**Owning aggregate:** Registration+Payment
**Concurrency control:** Database trigger (`trg_derive_payment_status`, Document 3, Section 4)
runs inside the same transaction as any `UPDATE` or `INSERT` on `payments`. No application
code ever sets `payment_status` directly — the column is set exclusively by the trigger.

**Rule:**
```
IF amount_paid <= 0        THEN payment_status = 'Unpaid'
IF 0 < amount_paid < fee    THEN payment_status = 'Part Payment'
IF amount_paid >= fee       THEN payment_status = 'Paid'
```

**Application constraint:** The Finance UI and API layer must never send a `payment_status`
value in a write request — only `amount_paid`. If a request includes `payment_status`
directly, the API layer discards it silently and logs a warning (this indicates a client
bug, not a security issue, since the trigger would override it regardless).

---

### BR-05 — Balance is always derived

**Owning aggregate:** Registration+Payment
**Concurrency control:** Postgres `GENERATED ALWAYS AS` column (Document 3, Section 4).
Balance cannot be written to directly — the database rejects any `INSERT`/`UPDATE`
statement that attempts to set it.

---

### BR-06 — Registration Status auto-confirms on full payment

**Owning aggregate:** Registration+Payment
**Concurrency control:** Database trigger (`trg_sync_registration_status`, Document 3,
Section 4), `AFTER UPDATE OF amount_paid, course_fee`. `payment_status` is derived by a
`BEFORE` trigger, so PostgreSQL would not fire an `UPDATE OF payment_status` trigger when the
application's original `SET` clause only names `amount_paid`. The function compares old/new
status, and the `WHERE registration_status = 'Registered'`
clause in the trigger's `UPDATE` prevents overwriting a Registration that has already moved
to `Attended` or `Cancelled` — the trigger only advances `Registered → Confirmed`, never
regresses or overrides a later state.

**Edge case handled:** If a Registration is manually set to `Cancelled` by an Admin, and a
late bank transfer then arrives and is marked Paid, the trigger's guard clause prevents the
Cancelled status from being silently overwritten back to Confirmed. This scenario must
surface to the Admin as a manual review case (Phase 1: visible in the registration list as
Cancelled + Paid, an intentionally visible anomaly for the Admin to resolve; Phase 2 could
add an explicit alert).

---

### BR-07 — Email deduplication

**Owning aggregate:** Communications (cross-cutting, not tied to Registration+Payment
aggregate — email_log is its own append-only aggregate)
**Concurrency control:** Database unique constraint `unique(registration_id, email_type)`
on `email_log` (Document 3, Section 4). This is the hard guarantee under concurrent
execution — for example, if the cron job and a manual retry both attempt to send
`reminder_2` for the same Registration within the same second, only one `INSERT` into
`email_log` succeeds; the second fails the unique constraint and the send is aborted before
the Resend API call is even made (see implementation pattern below).

```typescript
// modules/communications/email-engine.ts
async function sendEmailOnce(registrationId: string, emailType: EmailType): Promise<void> {
  // Reserve the slot FIRST, before calling Resend — this is the idempotency guarantee.
  const { error: reserveError } = await supabase
    .from('email_log')
    .insert({ registration_id: registrationId, email_type: emailType, success: false, sent_at: new Date().toISOString() });

  if (reserveError?.code === '23505') {
    // Unique constraint violation = already sent or already in progress. Skip.
    return;
  }
  if (reserveError) throw reserveError;

  try {
    const rendered = await renderTemplate(registrationId, emailType);
    if (!rendered) {
      // No template exists for this course + type (Section 12.3, PRD) — log and skip.
      await supabase.from('email_log').update({ success: false, error_message: 'skipped: no_template' })
        .match({ registration_id: registrationId, email_type: emailType });
      return;
    }
    await resend.emails.send(rendered);
    await supabase.from('email_log').update({ success: true })
      .match({ registration_id: registrationId, email_type: emailType });
  } catch (err) {
    await supabase.from('email_log').update({ success: false, error_message: String(err) })
      .match({ registration_id: registrationId, email_type: emailType });
    throw err;
  }
}
```

**Design rationale:** Reserving the log row before calling Resend (rather than after)
closes the race condition window entirely — two concurrent calls cannot both pass the
"has this been sent?" check and then both call Resend. This is the correct application of
P4.22 (idempotency is the application-level answer to at-least-once delivery/execution).

---

### BR-08 — Reminder cancellation on payment

**Owning aggregate:** Registration+Payment (payment_status is the source of truth) with a
read from Communications at execution time.
**Concurrency control:** The cron job re-checks `payment_status` immediately before sending
each reminder — not at query time, but at send time — using a fresh read within the loop.
This closes the window where a payment could be confirmed between the cron job's initial
query (step 2, Document 2 Section 7) and the actual send.

```typescript
// modules/communications/reminder-scheduler.ts
for (const registration of unpaidRegistrations) {
  const { data: current } = await supabase
    .from('payments')
    .select('payment_status')
    .eq('registration_id', registration.id)
    .single();

  if (current.payment_status === 'Paid') {
    continue; // Payment confirmed since the initial query — skip this reminder (BR-08).
  }
  await sendEmailOnce(registration.id, reminderType);
}
```

**Note:** "Cancels" a reminder means, precisely: the scheduled job checks Payment Status
immediately before sending and exits without sending if already Paid. It does not mean an
already-sent email is retracted — email cannot be unsent. This precise definition is stated
in PRD BR-08 and repeated here for the implementer.

---

### BR-09 and BR-10 — Automation gating by Active status and per-type toggle

**Owning aggregate:** Course+Batch (settings), read by Communications at send time.
**Concurrency control:** Not applicable — these are simple boolean reads, no race condition
exists since Batch settings changes and email sends are independent operations with no
shared mutable state requiring synchronization.

**Rule composition (both must be true for ANY email to send):**
```
send_allowed = batch.is_active
               AND batch.<specific_email_type>_enabled
               AND email_template.is_active (Course-level template toggle, Section 12.4 PRD)
```

All three gates are checked in the email engine before the BR-07 deduplication reservation
is made — this avoids reserving an email_log slot for an email that will never be sent,
which would incorrectly block a future legitimate send if the toggle is turned back on
later. **Correction to initial design:** the toggle check must happen before the BR-07
reservation, not after, or a temporarily-disabled email type becomes permanently
undeliverable once re-enabled (since the email_log row would already exist).

---

### BR-11 — Tutor data access restriction

**Owning aggregate:** Registration+Payment, filtered via Course+Batch
**Concurrency control:** Not applicable — this is a read-access rule, enforced by RLS
(Document 3, Section 6), not a write concurrency concern.

**Enforced at two layers (defence in depth):**
1. Database: RLS policies `tutor_read_confirmed_own_batch` and
   `tutor_read_confirmed_participants` (Document 3, Section 6).
2. Application: The `/my-courses` page and its API route additionally filter by the
   session's role as a fast-fail check before even querying the database — this is a
   performance and clarity optimisation, not the security boundary. **The RLS policy is the
   actual security boundary.** Application-level filtering must never be treated as
   sufficient on its own (P4.02 — design against human error; a forgotten application filter
   must not become a data breach).

---

### BR-12 — Verified By auto-fill

**Owning aggregate:** Registration+Payment
**Concurrency control:** Not applicable — single write, no race condition. `verified_by` is
set server-side from the authenticated session (`fn_current_staff_id()` — Document 3,
Section 6), never accepted as a value from the client request body. The API layer discards
any `verified_by` field present in an incoming request and overwrites it with the session's
staff ID.

---

### BR-13 — Paystack webhook signature validation

**Owning aggregate:** N/A — security gate, not a data rule.
**Concurrency control:** Not applicable.

```typescript
// modules/payments/paystack-webhook-handler.ts
import crypto from 'crypto';

function isValidPaystackSignature(rawBody: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}
```

The raw request body (not the parsed JSON) must be used for the HMAC computation — parsing
and re-stringifying the body before validation will produce a different hash and reject
every legitimate webhook. This is a common implementation error the agent must avoid.

---

### BR-14 — Paystack webhook idempotency

**Owning aggregate:** Registration+Payment
**Concurrency control:** Database unique constraint `unique(transaction_id)` on `payments`
(Document 3, Section 4) is the hard guarantee. Application-level pre-check is a fast path.

```typescript
async function processWebhookEvent(reference: string, payload: PaystackPayload) {
  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('transaction_id', reference)
    .maybeSingle();

  if (existing) {
    return { status: 200, message: 'already_processed' }; // BR-14 idempotent skip
  }
  // Proceed to update — if a race condition still occurs (two webhooks for the
  // same reference arriving within milliseconds), the unique constraint on
  // transaction_id causes the second UPDATE's underlying INSERT-equivalent
  // path to fail safely; this is caught and treated as an already_processed case.
  ...
}
```

---

### BR-15 — Mandatory DPA consent

**Owning aggregate:** Registration (root)
**Concurrency control:** Not applicable.
**Enforcement:** Client-side (form submit button disabled until checkbox checked) AND
server-side (`consent_given` is a `NOT NULL` boolean column with no default value permitting
`true`  — Document 3 shows `consent_given boolean not null` with no default, meaning the
API layer must explicitly reject any registration payload where `consent_given !== true`
before attempting the insert).

---

### BR-16 — Soft delete anonymisation

**Owning aggregate:** Participant (standalone)
**Concurrency control:** Not applicable — single admin-triggered write.
**Implementation:** See Document 3, Section 8, `fn_soft_delete_participant()`.

---

### BR-17 — Daily reminder job timing

**Owning aggregate:** N/A — scheduling rule.
**Implementation:** Vercel Cron `0 7 * * *` (Document 2, Section 7). Ghana operates at
UTC+0 with no daylight saving time changes, so no timezone drift correction is ever required
for this cron expression — this is one advantage of Ghana as a target geography that
several African markets in other timezones would not share.

---

### BR-18 — Course Fee is set at the Batch level

**Owning aggregate:** Course+Batch
**Concurrency control:** Not applicable — schema-enforced. `course_fee` exists only as a
column on `batches`, not on `courses` (Document 3, Section 4). There is no code path by
which a fee could be read from or written to the Course level, since the column does not
exist there.

---

### BR-19 — Registration form only shows future, Active batches

**Owning aggregate:** Course+Batch, read by Registrations at form-render time.
**Concurrency control:** Not applicable — read-only query.

```sql
select b.id, b.cohort_label, c.course_name
from batches b
join courses c on c.id = b.course_id
where b.is_active = true
  and b.start_date >= current_date
order by b.start_date asc;
```

---

## 3. Edge Cases

| # | Scenario | Resolution |
|---|---|---|
| EC-01 | A Participant registers for the same course but a different Batch (e.g. missed one cohort, joins the next) | Permitted. `unique(participant_id, batch_id)` allows multiple Batches for the same Participant — only the same Batch twice is blocked (BR-03). |
| EC-02 | Paystack webhook arrives for a Transaction ID that does not match any known Registration | Log to Sentry as an anomaly (possible payment for a registration made outside the system, or a data integrity issue). Return HTTP 200 to Paystack regardless (Paystack should not retry a webhook that was received and understood, even if unmatched) but flag internally for Admin review. |
| EC-03 | A Finance staff member enters an `amount_paid` greater than `course_fee` (overpayment) | Permitted by the `amount_paid >= 0` check constraint — no upper bound. `balance` becomes negative, `payment_status` resolves to `Paid` (BR-04's `>=` comparison). The negative balance is visible to Finance and Admin as a flag for manual refund or credit-toward-next-course handling — this is a business process, not a system automation, in Phase 1. |
| EC-04 | A Batch's `start_date` is edited by an Admin after Registrations already exist | Permitted. Reminder timing (E05, E06) recalculates automatically on the next cron run since it queries `start_date` live rather than storing a computed reminder date at registration time. |
| EC-05 | Two Finance staff attempt to mark the same Registration as Paid simultaneously (e.g. two browser tabs) | The second `UPDATE` succeeds harmlessly — setting the same values again. `trg_sync_registration_status`'s guard clause (`WHERE registration_status = 'Registered'`) means the second execution is a no-op after the first has already advanced the status. No error, no duplicate email (BR-07's `email_log` constraint prevents that independently). |
| EC-06 | An Admin deactivates a Batch (`is_active = false`) while Registrations with pending reminders exist | BR-09 gates all future sends on `is_active` — no further reminders for that Batch's Registrations will send from the next cron run onward. No retroactive action on already-sent emails. |
| EC-07 | *(Added Week 1 build — flagged for founder confirmation)* The public registration orchestration (Document 5, Section 2) must read the Batch, upsert the Participant, and return created rows, but the `anon` role deliberately has no RLS SELECT policies on those tables (public anon key must never read PII) | The server-side `POST /api/registrations` route performs the Zod-validated orchestration on the service-role client (a trusted server context, like the webhook). The anon insert policies from Document 3, Section 7 remain as defence in depth. A tightly-scoped `public_insert_payment` anon policy (initial state only: `amount_paid = 0`, no method/transaction/verifier) was added to the foundation migration for consistency with Document 3's anon grant on `payments`. |
| EC-09 | *(Added 2026-07-18 — founder-approved scope addition)* WhatsApp notifications alongside email, via the Meta WhatsApp Business Cloud API | Key moments only: `welcome` (doubles as payment instructions), `reminder_1`–`reminder_4`, `payment_confirmation`. Mirrors the email engine exactly: `whatsapp_log` with `unique(registration_id, message_type)` enforces send-once (BR-07 analog); gates (batch active, per-batch `whatsapp_enabled` toggle, payment-reminder toggle for reminders, participant not soft-deleted, usable phone) are checked BEFORE the reservation. Message bodies are pre-approved Meta templates (`course_registration_welcome`, `course_payment_reminder`, `course_payment_confirmation`) — see migration `202607180002_whatsapp.sql` header. When `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` are unset, all sends skip gracefully without reserving. **Budget note:** business-initiated template messages are billed per message by Meta (~$0.01–0.05 in Ghana) — an approved deviation from the strict $0/month constraint. |
| EC-08 | *(Added Week 1 build — flagged for founder confirmation)* The Management role needs `GET /api/dashboard/summary` (F1.08) but has no row-level RLS access to `registrations`/`payments` (F1.09 gives Management aggregates only, never row data) | The dashboard repository computes aggregates on the service-role client after the service layer verifies the session role is `admin` or `management`. Management never receives row-level data — only the computed figures — which matches the F1.09 access matrix exactly. |
| EC-10 | *(Added 2026-07-18 after live BR-06 verification)* A `BEFORE UPDATE` trigger derives `payment_status`, while a downstream trigger needs to react to that derived value | The downstream `trg_sync_registration_status` listens to the source columns (`amount_paid`, `course_fee`) and compares `old.payment_status` with `new.payment_status` inside the function. PostgreSQL's `UPDATE OF` trigger list is based on the original `SET` clause, not columns changed by another trigger. Migration `202607180003_fix_registration_confirmation_trigger.sql` captures the repair reproducibly. |

---

## 4. Ready for Development Checklist

```
□ 1. All 19 business rules implemented exactly as specified — no rule
      reinterpreted or simplified during implementation.
□ 2. Every rule's concurrency control mechanism implemented as specified —
      database constraints and triggers are not replaced with application-
      only checks anywhere in this list.
□ 3. BR-07's reservation-before-send pattern implemented exactly — the
      email_log row is inserted BEFORE the Resend API call, not after.
□ 4. BR-09/BR-10 toggle check confirmed to run BEFORE the BR-07 reservation
      (see the correction note under BR-09/10) — reversing this order
      creates a permanent-block bug for re-enabled email types.
□ 5. BR-13's signature validation uses the raw request body, not re-
      stringified JSON.
□ 6. BR-14's idempotency check happens before any payment record mutation.
□ 7. BR-06's guard clause (WHERE registration_status = 'Registered')
      confirmed present — prevents overwriting Cancelled/Attended states.
□ 8. All documented edge cases understood and their
      resolutions implemented, not left as unhandled exceptions.
□ 9. Next document to read: Document 5 — API Contract and Endpoint Specification.
```

---

*Document 5 of 12: API Contract and Endpoint Specification follows.*
*Input to Document 5: This document + Document 2 (API Surface Map) + Document 3 (Schema).*
