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

## 4. Support (next)

`core_tickets` (number, requester, channel, category, priority, status new|open|waiting_on_customer|
resolved|closed, context from the page, assignee, SLA clocks, a CAUSE tag at resolution),
`core_ticket_messages` (requester|staff|system; emailed replies from info@knowsia.com with Reply-To
info@), `core_reports` (the generalised flag: question, explanation, comment, lesson, tutor lesson;
unique per reporter and target; threshold behaviour kept). In-app "Report a problem" everywhere a
student can be stuck; the mailbox stays info@knowsia.com for now with "Log an email" for staff.

## 5. Leads & CRM (next) — without HubSpot, with what it adds

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
