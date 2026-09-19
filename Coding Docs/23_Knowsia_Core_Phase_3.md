# 23 — Knowsia Core, Phase 3: Files, Communications, Support, Leads & CRM

**Status:** in progress from 2026-09-19. Founder direction: "Start building all now. Exclude
HubSpot and build any capability it may add." Channels kept: **all** — email (Resend), SMS
(Arkesel), WhatsApp (Meta Cloud API), voice (Vapi). Support inbox: **info@knowsia.com for now**.
This is the record Doc 22 §7 asked for; Doc 22 §8 (definition of done) applies to every module here.

## 1. The shape every module takes

Built in `knowsia-api` under `app/platform/` with `core_` tables on the platform Alembic branch,
reached only through `app/platform/index.py`; an admin router under `app/admin/routers/platform/`;
a student router under `app/platform/routers/` where a person acts; a service door under
`/api/v1/service/…` for this app (contract regenerated on every change, asserted by
`tests/unit/knowsia-core-contract.test.ts` here); scheduler ticks in `app/core/scheduler.py`; every
admin or service write an audit row; a KPI that reads from it; an admin page `/admin/<module>`.
This app becomes a CALLER over the service door — its TypeScript modules are retired in Phase 7 —
and where a fallback exists (R2 for slips, the provider clients for sends) it stays until Core has
been watched, and reports every fallback to Sentry.

Order: **Files → Communications → Support → Leads & CRM**, one release each.

## 2. Files (built 2026-09-19)

`core_files`: owner (`owner_type`/`owner_id`), `purpose` (answer_sheet_page, lesson_material,
course_cover, instructor_photo, payment_slip, ticket_attachment, export, import, other),
`visibility` (public|private), `storage` (bunny_public|bunny_private|postgres) + `storage_key`,
`media_type`, `byte_size`, `sha256`, `gate` (the verdict), `retention_until`, `status`
(stored|quarantined|deleted). `core_file_blobs` holds a private file's bytes only until a private
zone exists.

**One gate.** Type sniffed from the bytes; size cap per purpose; documents through
`content_security.inspect_document` and the antivirus; quarantine, never clean-and-pass; storage
key `purpose/owner/<uuid>.<ext>`, never the upload's name. **Two stores.** Public → Bunny zone +
CDN URL. Private → a Bunny zone with **no pull zone**; the API streams the bytes only against an
HMAC token that dies inside 15 minutes (`GET /api/v1/files/{id}?t=`). A file id is not a URL.

**This side:** payment slips are stored through `POST /api/v1/service/files`
(`lib/knowsia-core/files.ts`); `payment_submissions.slip_file_path` carries `core:<id>` and the
staff slip link comes from `GET …/files/{id}/link`. R2 stays as the fallback while Core is
unreachable, with Sentry on every fallback. Learning materials and assignment submissions follow
in a later pass on the same door.

## 3. Communications (built 2026-09-19)

`core_messages` (one log, every channel: email|sms|whatsapp|voice|in_app; template + version;
recipient user|participant|lead|staff|address plus the Core identity when linked; status
queued→sending→sent→delivered/opened/clicked/bounced/failed/skipped/cancelled; the provider's id;
`idempotency_key` UNIQUE per channel), `core_message_templates` (key, channel, version; `{{var}}`
with an unknown token an ERROR — never sent with a hole; a new version every save, the old one
stays attached to what it sent), `core_comm_preferences` (per person, keyed `identity:<id>` or
`email:`/`phone:<address>`: marketing, a switch per channel, quiet hours), `core_suppressions`
(unsubscribe | bounce | complaint | staff | invalid; UNIQUE per channel + address).

**The gates run at queue time and answer with a row that says why**, never an exception at the
caller: `invalid_address`; `suppressed:<reason>` — marketing is stopped by any suppression,
transactional/system by bounce, complaint or invalid, SECURITY mail (a password reset) only by
invalid; `channel_off` / `marketing_off` from the person's own choices, which security mail
ignores (nobody opts out of their own reset); marketing is moved past quiet hours; a call is held
to the 10:00–18:00 UTC calling window. A channel with no key writes `skipped/not_configured`.
Adapters: Resend, Arkesel, Meta WhatsApp (approved template + positional params), Vapi (the
assistant lives in the dashboard; variables per call; `schedulePlan.earliestAt`); one Ghana-aware
phone normaliser. A dispatcher tick every minute sends what is due (SKIP LOCKED, per-channel cap,
three attempts with backoff); `immediate` sends before returning. Webhooks: `POST /api/v1/webhooks/
resend` (Svix-signed; a bounce or complaint suppresses the address) and `POST /api/v1/webhooks/vapi`
(end-of-call summary, transcript, outcome on the row). Every Study sender now goes through it.
Admin `/admin/messages`; a student's choices as three sentences on `/account`; `/unsubscribe`.

**This side:** `lib/knowsia-core/messages.ts` speaks the door. `lib/resend/client.ts`,
`lib/arkesel/client.ts`, `lib/whatsapp/client.ts` and `lib/vapi/client.ts` send THROUGH
`POST /api/v1/service/messages` first (product `registration`, `immediate: true`) so Core's log is
complete without rewriting the engines; direct to the provider only when Core is not configured,
unreachable, or answers `skipped/not_configured` for that channel (Sentry on every fallback). A
refusal on the person's behalf — unsubscribed, bounced, channel off — raises
`MessageSuppressedError` and is NOT retried direct: that is a decision, not an outage. Each client
takes an optional `idempotencyKey`, `category`, `templateKey` and `recipient`, so an engine that
already deduplicates (`email_log`) can pass its key through and a marketing send can say so.
`marketingConsentService.optOut` also writes Core's suppression list;
`scripts/sync-opt-outs-to-core.mjs` backfills the rows that exist. The Registration cron, Vercel
and Cloudflare-worker schedulers are unchanged: Core holds the record, this app still decides when.

## 4. Support (built 2026-09-19)

**Built as designed below, with these particulars.** Numbers run from #1001 on a sequence. The
first-response clock is `FIRST_RESPONSE_HOURS` by priority (urgent 4, high 8, normal 24, low 48)
and a due moment that lands on a weekend rolls to Monday 09:00 UTC. A ticket is acknowledged at
once through Communications (`ticket_received`, from `CORE_SUPPORT_FROM` = info@knowsia.com,
Reply-To the same, so a reply lands in the inbox the team reads); a staff reply is the FIRST
RESPONSE, moves the ticket to `waiting_on_customer` and is emailed (`ticket_reply`); an internal
note is neither; resolving without a cause is refused; a requester's reply after resolution
reopens it and `reopened_count` grows. The queue is ordered breaching → new → last movement.
The old flag doors (`POST /api/v1/flags`, `POST /tutor/lessons/{id}/flag`) keep their
threshold-hide and now also write a `core_reports` row, so the reason survives; reports are read
grouped by target, most reported first, every reason kept. `lms/index.py:unanswered_qna_internal`
feeds the Support queue. Student: "Report a problem" at the foot of every question and lesson
page (the page supplies the context), "Your requests" on `/account`. Admin: `/admin/support`.
KPIs gain a Support section. **This side:** nothing to move — `feedback` stays with Registration;
a request that arrives at info@knowsia.com is logged on `/admin/support` by hand for now.

Original design, for the record:
`core_tickets` (number, requester, channel, category, priority, status new|open|waiting_on_customer|
resolved|closed, context from the page, assignee, SLA clocks, a CAUSE tag at resolution),
`core_ticket_messages` (requester|staff|system; emailed replies from info@knowsia.com with Reply-To
info@), `core_reports` (the generalised flag: question, explanation, comment, lesson, tutor lesson;
unique per reporter and target; threshold behaviour kept). In-app "Report a problem" everywhere a
student can be stuck; the mailbox stays info@knowsia.com for now with "Log an email" for staff.

## 5. Leads & CRM (built 2026-09-19) — without HubSpot, with what it adds

**Built as designed below, with these particulars.** One lead per (product, email): a second
enquiry from the same address is an `enquiry` activity on the same lead, the fuller fields win,
the score never goes down, and a lead marked lost or unresponsive who asks again is `new` again.
Scoring is pure and small (base 10, +20 a job title, +15 a company, a source weight, cap 100;
+25 on conversion; −10 for every 30 days without contact, computed on read). Assignment is a
`core_lead_rules` row per source (or `*`) with owners taken in turn; no rule → the lead sits on
Today as "nobody's yet". `lost` needs a reason. A logged contact resets the clock and clears a
follow-up whose time had passed. **Conversion is an event**: Study's `PAYMENT_SETTLED` (the
outbox) and this app's paid transition (`POST /api/v1/service/leads/converted`) mark the lead
converted and the opportunity won, keyed by `source_ref` so a webhook and a verify are one sale.
Today = overdue tasks and follow-ups → due today → new unowned, each row with its reason; the
timeline is activities ∪ messages sent to the address ∪ tickets from it; a segment is its
definition run now; owners of overdue follow-ups are emailed once a day (`follow_up_due`).
Public door `POST /api/v1/leads/enquire` (honeypot, five an hour per IP, attribution kept,
`lead_enquiry_ack` sent). Admin `/admin/crm`. The study landing page posts to Core now.

**This side:** `lib/knowsia-core/leads.ts`. `createEnquiryLead` forwards every enquiry to
`POST /api/v1/service/leads` with this app's `leads.id` as `external_ref` (this app's row and
screens are unchanged); `runPaidTransitionSideEffects` → `reportPaidSeatToCoreSystem` tells Core
the seat was paid (`kind: cohort_seat`, `source_ref: registration id`). Both best effort with
Sentry — Core down never costs an enquiry or a payment. This app's `/leads`, `/sales` and
`/follow-up` stay until Phase 7 retires them; Core holds the record across both products.

Original design, for the record:

`core_leads` (exact-email dedup, source, interest, status new|contacted|qualified|converted|lost|
unresponsive, score, owner, next action, attribution), `core_lead_activities` (the FULL enum —
this app's `lead_activities` CHECK silently drops four of the twelve types it writes),
`core_opportunities` (kind cohort_seat|subscription|corporate|tuition, stage, amount, days in stage),
`core_tasks`, `core_segments` (saved queries). "Today" = next actions in order with the reason.
Conversion from `PAYMENT_SETTLED` (outbox) and this app's paid transition. Doors: public
`POST /api/v1/leads/enquire` (honeypot, rate limit, attribution) for the study landing page;
`POST /api/v1/service/leads` — this app's `/api/enquiries` forwards every enquiry.

## 6. Not built, on purpose

HubSpot (excluded by the founder). Email-to-ticket parsing (the inbox is info@ for now). Affiliates
and payouts (Phases 4 and 6). Retiring this app's TypeScript modules (Phase 7).
