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

**Rule** (branch order revised 2026-08-03, `202608030048_free_events.sql`):
```
IF amount_paid >= fee       THEN payment_status = 'Paid'
IF amount_paid <= 0         THEN payment_status = 'Unpaid'
OTHERWISE                        payment_status = 'Part Payment'
```

**Why the settled test comes first.** The original ordering tested
`amount_paid <= 0` before `course_fee` was ever consulted, so a fee of zero —
a free event (`batches.is_free`), a 100% code discount, or a full staff fee
waiver granted before any money arrived — resolved to `'Unpaid'` and could
never become `'Paid'`. That left those registrations permanently unconfirmed:
no Zoom join link, no attendance, no certificate, and chased daily by the
reminder cron for an outstanding GHS 0.00. The settled-first ordering matches
`fn_derive_installment_status`, which has always ordered its branches this way.

**Consequence:** a zero-fee Payment is `'Paid'` from the moment it is inserted.
`payment_status = 'Paid'` therefore no longer implies money was collected —
anything reasoning about revenue must read `amount_paid`, or exclude
`batches.is_free`, rather than trusting the status alone. See BR-06 and the
free-events notes in `modules/dashboard/service.ts` and
`modules/certificates/service.ts`.

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
Section 4), `AFTER INSERT OR UPDATE OF amount_paid, course_fee`. `payment_status` is derived by a
`BEFORE` trigger, so PostgreSQL would not fire an `UPDATE OF payment_status` trigger when the
application's original `SET` clause only names `amount_paid`. The function compares old/new
status — guarded by `TG_OP`, since `OLD` is NULL on an INSERT — and the
`WHERE registration_status = 'Registered'`
clause in the trigger's `UPDATE` prevents overwriting a Registration that has already moved
to `Attended` or `Cancelled` — the trigger only advances `Registered → Confirmed`, never
regresses or overrides a later state.

**INSERT arm (added 2026-08-03, `202608030048_free_events.sql`):** since BR-04's
reorder, a zero-fee Payment is born `'Paid'` and no `UPDATE` ever follows it, so
an UPDATE-only trigger would never confirm the Registration. The trigger now also
fires on INSERT. Note that database triggers cannot send email or call Zoom, so
the enrollment side effects that normally hang off the Paystack webhook are
kicked off in application code instead — `paymentsService.runZeroFeeEnrollmentSideEffects`,
called from `createRegistration` and from every discount/credit path that closes a
balance at `amount_paid = 0`. That function deliberately omits the
`payment_confirmation` receipt and commission accrual: no money changed hands.

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

### BR-19 — Registration form only shows Active batches that have not yet ended

**Owning aggregate:** Course+Batch, read by Registrations at form-render time.
**Concurrency control:** Not applicable — read-only query.

```sql
select b.id, b.cohort_label, c.course_name
from batches b
join courses c on c.id = b.course_id
where b.is_active = true
  and b.end_date >= current_date
order by b.start_date asc;
```

**Late registration (founder decision, 2026-08-12).** The window used to close on
`start_date >= current_date`, i.e. a cohort became unregisterable at midnight on its own
first day even though it went on running for weeks. That is what happened on 2026-08-11:
a registrant took the Enterprise Risk Management intake (future start date, visible) and
was unable to take the AI-Powered Financial Reporting one (already begun, absent from the
form), with no route in except a staff bulk import. The window now closes on `end_date` —
**a course that is still teaching is a course someone can still join**, and whether joining
part-way through is worth it is the registrant's judgement to make, not the form's.

`end_date` is `NOT NULL` on `batches`, so there is no null branch to handle.

Three consequences that are deliberate, not oversights:

- **The gate is enforced in two places and both moved together.** The form's query is only
  the visible half; `createRegistration` re-checks the same condition server-side, which is
  why a deep link with a known `batchId` was rejected too. A change to one without the other
  produces either a listed-but-unregisterable batch or an invisible-but-registerable one.
  `transferRegistration`'s destination check is the same rule and moved with them.
- **The public course catalogue shares the window.** Otherwise `/courses` tells a visitor an
  intake is gone while `/register` still accepts them onto it.
- **Closing an intake early is `is_active = false` (BR-01), not the date.** The date window
  answers "is this cohort still running"; the flag answers "do we want more people in it".
  Conflating them is what made the old rule unable to express "started, but still open".

The registrant is told what they are joining rather than being enrolled silently: a started
intake is labelled *in progress* in the form's dropdown and, once selected, states its start
and end dates and that earlier sessions have been missed.

**Downstream behaviour that is unchanged and worth knowing.** A late registrant gets the
normal welcome email, whose `.ics` attachment carries a start date now in the past — harmless,
and preferable to suppressing the invitation. Early-bird pricing needs no special case: a
started batch's `discount_cutoff_date` has necessarily passed, so `effectiveCourseFee` already
returns the full fee. A started batch that is full still routes to the waitlist as normal.

**Voice call targeting followed on 2026-08-13 (founder-directed).** `payment_followup` and
`bank_transfer_chase` in `modules/voice/repository.ts` filtered on `start_date >= current_date`,
which was near-tautological while BR-19 also closed registration on `start_date` — no unpaid
registration could exist on a started batch. Late registration broke that pairing and left an
unpaid late registrant chased by nothing at all, which is backwards: they are consuming the
course while owing for it. Both now use `end_date >= current_date`; `bank_transfer_chase` keeps
its "not more than 3 days before the start" upper bound, so the only thing that moved is the
lower one.

Neither can become repeated nagging. `reserveCallSlot` inserts a `(registration_id, call_type)`
row under a unique constraint before dialing, so each Registration gets **at most one call of
each type, ever** — widening a window changes who becomes reachable, never how often anyone is
rung.

Chasing still stops at `end_date`. Money owed on a *finished* course is a different and harder
conversation than "your seat isn't confirmed yet", and the BR-38 auto-lapse sweep is what closes
that population out 15 days later; extending calls past the end would be a new policy rather
than this fix.

One consequence needed handling outside the query. The Vapi system prompt describes the course
as *"starting {{start_date}}"*, which is false for a cohort that began last week — and a money
call that opens on a false statement is the fastest way to lose the listener. The dispatcher now
computes `{{course_timing}}` server-side (`courseTimingPhrase`) and sends it alongside the
unchanged `{{start_date}}`. **The prompt text itself lives in the Vapi dashboard and cannot be
deployed from this repo** — see Document 7 §11.3 step 6 for the exact paste, the same manual
step the `ad_hoc` call type needed.

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
| EC-11 | *(Added 2026-08-09, BR-35–BR-41)* A participant pays via Paystack against a Registration that has already been written off | Recorded normally — real money must never be discarded. BR-06's guard clause means the trigger leaves the status at `'Lapsed'`, producing a visible Lapsed + Paid anomaly (the same shape BR-06 already documents for Cancelled + Paid). Resolution is `reinstateRegistration`, which restores `'Confirmed'` since the fee is now settled. The portal's *other* payment paths (installment plan, payment-proof submission, coupon) refuse a lapsed Registration outright — only Paystack, which is client-initiated and webhook-reconciled, can reach this state. |
| EC-12 | *(Added 2026-08-09, BR-38)* A Registration is written off, then the Batch's `end_date` is edited forward, or the Batch is reactivated | The sweep re-reads `end_date` live and skips anything with `lapsed_at` set, so nothing is re-processed and nothing is silently reopened. A Registration that should be back in play needs an explicit `reinstateRegistration` — the same "a person decides" posture as the part-payment exclusion. |
| EC-13 | *(Added 2026-08-09, BR-38)* A part-paid no-show is never closed by the sweep and so accumulates in receivables indefinitely | Accepted and deliberate (founder decision, 2026-08-09). The manual write-off action is what closes these, case by case, after a human has decided between refund, credit and chase. This makes `lapseRegistration` load-bearing rather than a convenience — without it, this population has no ending. |
| EC-14 | *(Added 2026-08-12, BR-19)* A Participant registers for a Batch that is already part-way through its run | Permitted since 2026-08-12 — this is the late-registration window, not an edge case to be blocked. They join at the current point in the course, having missed the sessions already delivered; the form says so before they submit. Certificate eligibility is unaffected in its own terms but harder to earn in practice on a free Batch, where it depends on attendance rows clearing `MIN_ATTENDANCE_RATIO` and only the remaining sessions can produce any. |
| EC-15 | *(Added 2026-08-12, BR-19)* A Batch's `end_date` is edited backwards to a past date while it is still listed on the public form | The window is re-read live on every form render and re-checked in `createRegistration`, so the Batch disappears and further registrations are refused from that moment — no cached list and no stored "is open" flag to go stale. Registrations already taken are untouched, exactly as EC-04 leaves `start_date` edits alone. |

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

---

## 5. Planned Live Learning Operations Rules

- **BR-20:** A LiveSession belongs to one Batch and is the source of truth for one class occurrence; a published session is never silently edited into a different occurrence.
- **BR-21:** A learner may join only when enrolled, eligible by payment/approval, active, within the join window, and assigned a valid personal provider link. Overrides require an authorised actor, reason, and expiry.
- **BR-22:** Provider attendance is provisional until tutor/admin exception review. Final attendance changes require audit evidence; AI cannot finalise it.
- **BR-23:** Rescheduling preserves the original session, reason, affected learners, and notification evidence; it creates or links the replacement occurrence.
- **BR-24:** Recording release requires consent, role/enrolment eligibility, retention metadata, and tutor/admin approval.
- **BR-25:** AI may draft learning summaries, reminders, catch-up tasks, and risk lists, but cannot finalise grades, attendance, access overrides, or certificates.

See Document 14 for the workflow and acceptance criteria.

## 6. Corporate Registration Rules (2026-07-26)

- **BR-26:** A seat allocation's `seats_purchased` must never exceed the batch's seats
  remaining at time of sale; capacity is reserved immediately (via a silent capacity nudge),
  not just at fill time.
- **BR-27:** A participant cannot be registered twice under the same seat allocation — same
  dedup posture as BR-03, enforced by the same `unique(participant_id, batch_id)` constraint
  plus a partial unique index scoped to `company_allocation_id`.
- **BR-28:** Company admin portal sessions follow the same lockout (5 attempts / 15 minutes)
  and PIN-hashing posture as participant portal sessions.
- **BR-29:** A company admin session may only ever read or write data scoped to its own
  `company_id` — enforced entirely in the service layer (no per-row RLS for this identity
  tier, same as the participant portal) — and can never mark a payment Paid, since no staff
  identity exists for that write to be attributed to (BR-12).
- **BR-30:** Cancelling a seat allocation releases only its unfilled seats back to public
  capacity and triggers the existing waitlist-notify side effect; already-created employee
  registrations are never touched (same "don't destroy history" posture as BR-18).

See Document 15 for the full workflow and acceptance criteria.

## 7. Tutor Portal Rules (2026-07-27)

- **BR-31:** Tutors are external parties, not Knowsia staff — they never get a `staff_users`
  row or a Supabase Auth login. Authentication is exclusively via the tutor portal (PIN +
  opaque session cookie), the same non-staff pattern as the participant and company portals.
- **BR-32:** A tutor portal session may only ever read data scoped to its own `tutor_id` (its
  own batches, live sessions, rosters, attendance, certificate eligibility) — enforced entirely
  in the service layer, since these tables have RLS enabled with zero policies (no per-row RLS
  for this identity tier, same posture as BR-29).
- **BR-33:** A tutor can never see any participant's payment/financial data. The roster read
  never selects the `payments` table at all — stronger than a role-based field-strip, since the
  data is never fetched in the first place.
- **BR-34:** Attendance stays exclusively owned by the Zoom-sync cron job; the tutor portal is
  read-only in v1 — there is no tutor-facing attendance write path.

See Document 16 for the full workflow and acceptance criteria.

## 8. Written-off Registrations (2026-08-09)

Founder direction: an unpaid no-show must stop counting against receivables and must stop
sitting on the participant's own account. Until this, `registration_status` had no terminal
state that anything ever wrote — only `Registered -> Confirmed` existed — so such a
registration stayed open forever.

- **BR-35:** `'Lapsed'` is a distinct registration status meaning *written off as
  uncollectible*, deliberately not a second meaning for `'Cancelled'`. `'Cancelled'` is the
  participant's or an admin's decision to withdraw; `'Lapsed'` is ours to stop collecting.
  Keeping them separate is what makes "who abandoned us after registering" answerable as a
  query — that population is a re-marketing audience and a lead-quality signal, and the
  cancelled population is the opposite.
- **BR-36:** Writing off **never** touches `amount_paid`. Zeroing a balance by inventing a
  payment would put money into the revenue figures that never arrived. The balance stays on
  the row as a fact; the status is what makes it non-collectible. A fully-paid Registration
  therefore cannot be written off at all — there is nothing to collect.
- **BR-37:** Every write-off carries `lapsed_at`, `lapsed_by` and `lapsed_reason`, enforced by
  `registrations_lapsed_audit_check` (a `'Lapsed'` row must have `lapsed_at`; a non-`'Lapsed'`
  row must not). `lapsed_by` is NULL exactly when the automatic sweep did it rather than a
  person. `lapsed_at IS NULL` is also the sweep's idempotency key.
- **BR-38:** The automatic sweep writes off a Registration **15 days after its Batch's
  `end_date`** when `amount_paid = 0` **and** no attendance row exists. Part-payers are
  deliberately excluded (founder decision, 2026-08-09): real money changed hands, so a refund/
  credit/chase decision belongs to a person, not a cron job — they stay in receivables until
  written off by hand. Free batches are excluded outright (their payments settle to `'Paid'` at
  GHS 0, so nobody on one can be a debtor). Attendance is tested as row *existence*, not against
  `MIN_ATTENDANCE_RATIO` — anyone the Zoom sync saw at all is a person for staff to judge.
- **BR-39:** A write-off is silent — no email, SMS, WhatsApp or call goes to the participant.
  Telling someone "we have written off the course you did not attend" is a collections letter
  nobody asked for, and the whole point is that the balance is not being pursued.
- **BR-40:** Every figure that means "money we expect" or "someone to chase" excludes lapsed
  rows: the dashboard's `expectedRevenue`/`outstandingBalance`, the Payments screen's
  `'outstanding'` filter and its CSV export, the payment-reminder query, all three voice-call
  money/no-show queries, and the batch capacity count (so a written-off seat is a freed seat).
  The participant's portal withdraws every surface that would take a payment — Pay Now, the
  coupon field, the installment plan, the payment-proof upload and the credit-redemption
  dropdown — while still displaying the real balance, marked "Closed — not collected".
- **BR-41:** A write-off is reversible. `reinstateRegistration` restores `'Confirmed'` if the
  fee is settled and `'Registered'` otherwise, clearing the whole audit triple. This is the
  resolution path for the Lapsed + Paid anomaly BR-06 describes — Paystack's own Pay Now is
  deliberately **not** gated on lapse, because if real money arrives it must be recorded.

Written off manually via `POST /api/registrations/[id]/lapse` (admin + finance — a receivable
is finance's call, so the write runs service-role with the service layer as the authorization
boundary, since only `admin` holds an RLS UPDATE policy on `registrations`). Reinstated via
`DELETE` on the same route. The sweep runs inside the 07:00 cron; `POST
/api/cron/registrations/auto-lapse` is a manual trigger that is **dry-run by default**,
because the first real run closes out the entire historic backlog in one pass.

---

## 6. Re-enrolment by an existing Participant (BR-42, BR-43) — added 2026-08-12

Founder direction: *"those with an already existing account should not go through the same
process of registering, since their information is already captured — they only have to enrol
on to the course they're interested in."*

The gap was real. The student portal's "Explore Courses" panel ended in a plain link to
`/register`, so somebody already signed in — whose `participants` row already holds their
first name, middle name, surname, gender, email, phone, job title, company and a timestamped
data-processing consent — was dropped into the blank public form to type all of it again.

- **BR-42:** A Participant with a portal session may enrol onto any Batch that BR-19 says is
  open, without re-entering anything already on their record. `POST /api/portal/enrol` takes a
  `batchId` (and optionally a coupon code); **who** is enrolling comes from the session cookie
  and never from the request body, so the endpoint cannot register anyone but its caller.

  It does **not** write a Registration itself. `portalService.enrolInBatch` rebuilds the
  registration input from the stored record and delegates to the same
  `registrationsService.createRegistration` the public form posts to. Registrations therefore
  remains the sole owner of BR-01/BR-02/BR-03/BR-15/BR-19, the capacity/waitlist branch,
  coupon and partner attribution, the welcome and payment emails, lead capture and the sales
  opportunity — there is no second implementation to drift out of step. A full Batch returns
  `outcome: 'waitlisted'` exactly as the public form does.

  **BR-15 is satisfied from the stored consent, not a fresh checkbox** (founder decision,
  2026-08-12): consent is to the processing of their personal data, given once and recorded in
  `participants.consent_at`, not a per-course question. It is still *enforced* — a record
  carrying `consent_given = false` is refused and sent to the full form, rather than being
  waved through on an assumption.

  Fields are topped up, never re-collected: `gender`, `jobTitle` and `company` may be supplied
  in the request, but are used **only** where the participant's own record has a gap (legacy
  imports, mostly). Anything still missing comes back as `MISSING_PROFILE_FIELDS` naming just
  those fields, and the portal reveals inputs for them alone.

- **BR-43:** A re-enrolment records `lead_source = 'Returning'`, a value that is
  **system-assigned and never self-declared**.

  A Lead Source answers "which marketing channel brought this person to us", and that question
  has no honest answer for someone who already has an account. Carrying their original source
  forward re-credits that channel on every future course they take, permanently overstating it
  in the dashboard, the leads filters and campaign audience building. `'Other'` is the
  genuine-unknown bucket, and burying known returning students in it destroys the ability to
  count repeat enrolments at all — for a training business, close to the most valuable number
  there is. This is the same reasoning that produced `'Lapsed'` rather than a second meaning
  for `'Cancelled'` three days earlier: once two distinct facts share a value they can never be
  separated again except by string-matching free text.

  The public form does not offer `'Returning'` and `POST /api/registrations` rejects it, via
  `publicRegistrationInputSchema` — an anonymous visitor claiming it would corrupt the one
  figure the value exists to make countable. The same restriction applies to the staff bulk
  import, the corporate employee-add and the assistant's `propose_create_lead`. Reads are the
  opposite: `parseLeadSource`, the registration and lead list filters and the leads UI dropdown
  all take the **full** set, because they are handling values coming back out of the database.
  `LEAD_SOURCES` / `SELF_DECLARED_LEAD_SOURCES` in `lib/domain/types.ts` are the one place that
  distinction is expressed; the enum used to be repeated in eight places.

  **`'Returning'` is not the repeat-business metric, and must not be used as one** (settled
  2026-08-13). It marks the *path* somebody took, not the fact that they came back: it is only
  ever set by the portal's one-click enrolment, so a returning student who registers through the
  public form while logged out is recorded under whichever marketing channel they pick — which is
  correct, since that channel is what re-reached them, but it means a count of `'Returning'`
  systematically undercounts repeat business. Repeat rate is instead **derived from registration
  history**: any registration that is not that participant's first is a repeat, which is exactly
  computable and independent of how they arrived. See `selectRepeatEnrolmentStats` and the
  Repeat Enrolments tile on the dashboard.

### BR-44 — A logged-out repeat registration is deduplicated by email, not by person

Registering while signed out is a normal, supported path; the portal is a convenience, never a
requirement. Three cases, and they behave differently:

- **Same email.** `findOrCreateParticipant` upserts with `onConflict: 'email'`, so no second
  Participant is created and their existing record is refreshed. `unique (participant_id,
  batch_id)` then decides: the same Batch raises a unique violation surfaced as
  `409 DUPLICATE_REGISTRATION`, and a different Batch is permitted (EC-01). This is a database
  guarantee, so it holds against two simultaneous submissions, not just sequential ones.
- **A different email.** *Not* deduplicated. `participants.email` is the only unique key —
  `phone` is `not null` but deliberately not unique, because shared household and office numbers
  are common in this market. The same person using a second address becomes a second Participant
  with a second portal login, and BR-03 cannot fire because the `participant_id` differs. Known
  and accepted; merging duplicates is a manual staff action if it ever shows up in the data.
- **Lead source.** They cannot be recorded as `'Returning'` — see BR-43. This is why the repeat
  metric is derived from history rather than from the enum.

To keep the logged-out path from being the *default* for people who already have an account, the
public form carries a standing prompt above the fields pointing returning participants at the
portal. It is shown unconditionally rather than triggered by looking the typed email up: a public
"does this address have an account?" endpoint is an account-enumeration oracle, and portal login,
tutor login, portal forgot-PIN and staff forgot-password all deliberately return identical
responses precisely so that they cannot be used to probe who is a participant. The prompt reaches
the returning student either way, and tells a stranger nothing.

  Schema: `registrations_lead_source_check` and `waitlist_entries_lead_source_check` both gain
  the value in `202608120060_returning_lead_source.sql`. The waitlist constraint is not
  optional — a returning student enrolling onto a **full** Batch takes createRegistration's
  waitlist branch, which forwards the same `lead_source`, so leaving it alone would turn
  "enrol me" into a constraint violation for precisely the Batches most in demand.
  `leads.lead_source` has no CHECK and needs no migration, but its application-side enum gains
  the value in the same commit — otherwise `createLead` silently rejects every returning
  student's lead row, a failure `createRegistration` logs rather than raises.

### BR-45 — A KnowsiaApp handoff proves identity, never entitlement

Seam I of platform convergence (`Coding Docs/19_Platform_Convergence.md` §4) lets a signed-in
Participant open KnowsiaApp — the separate AI exam-prep platform — without a second login. The
rule that keeps the two systems' responsibilities apart:

- **A handoff answers "who is this", and nothing else.** `redeemKnowsiaAppHandoff` returns
  `participantId`, `email`, `fullName`, `phone` and any existing link. It deliberately carries no
  registration, payment status, batch, or access field. What a linked user may *study* is decided
  by KnowsiaApp against its own subscription model, and by Seam III when a paid cohort grants
  question-bank access. Widening this payload is how Seam I silently becomes Seam III, with
  entitlement rules split across two systems and neither owning them.
- **No status gate.** A Lapsed (BR-38) or Unpaid Participant still has a valid identity and still
  gets a handoff. Refusing one here would be an entitlement decision wearing an identity costume.
  The only check is `participants.deleted_at is null` — a soft-deleted person's details are not
  handed to another system (BR-16).
- **Identity comes from the session cookie, never the request body.** `POST /api/portal/handoff`
  takes no participant parameter at all, so it cannot be pointed at anyone else. Same rule as
  `POST /api/portal/enrol` (BR-42).
- **Single-use, 60 seconds.** The row's id *is* the token, consumed by an atomic conditional
  UPDATE — the same race-safe construction as `portal_login_tokens` and
  `participant_pin_reset_tokens`. 60 seconds rather than the 15 minutes a PIN reset gets, because
  a machine redeems this inside a browser redirect. Redemption *also* requires
  `KNOWSIA_APP_SERVICE_KEY`, so an intercepted token — and it does travel in a URL, so assume it
  is logged — is worth nothing on its own.
- **A link never moves.** Re-linking the same pair is a no-op; a *different* KnowsiaApp user for
  an already-linked Participant is a `409 ALREADY_LINKED`, not an overwrite. One Participant is
  one person; a link that moves means something went wrong upstream, and the newer value is not
  automatically the better one.

  Schema: `knowsia_app_handoff_tokens` plus `participants.knowsia_app_user_id` /
  `knowsia_app_linked_at` in `202608130061_knowsia_app_account_link.sql`. The two columns are
  paired by CHECK (same discipline as `lapsed_at`/`lapsed_by`), and a partial unique index keeps
  one KnowsiaApp user mapped to at most one Participant. The token table is RLS-enabled with zero
  policies — service-role only, matching both existing token tables. Dormant until
  `KNOWSIA_APP_URL` and `KNOWSIA_APP_SERVICE_KEY` are both set.