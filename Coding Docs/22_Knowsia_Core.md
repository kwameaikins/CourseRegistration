# 22 — Knowsia Core: the platform layer every product plugs into

**Status:** founder decision 2026-09-18; Phase 0 and Phase 1 built and released the same
day (KnowsiaApp commit on `main`, Railway deployment recorded in KnowsiaApp `PLAN.md` §3.2).
**Supersedes nothing; extends Doc 21.** Doc 21 decided one Python backend and one Next.js
frontend with money migrating last. This document names the part of that backend every
Knowsia product shares, and the order in which the Registration app's modules move into it.
**Read this before building any feature that touches a person, a payment, an email, a lead
or a partner** — the question is no longer "which repo", it is "which Core module".

---

## 1. The decision, and why

Across the two codebases there are ~38 modules. Sorted by one question — *would a third
Knowsia product (a CPD app for another profession, a corporate learning portal) need this
unchanged?* — eleven of them are not products at all. They are the business's operating
system, and each existed twice, half-built on each side (two user tables per student, two
Paystack webhook handlers, two email frames and two send logs, one lead form posting across
the seam to the other repo's queue).

**Knowsia Core** is those eleven capabilities as ONE deployable with hard module
boundaries — the discipline `knowsia-api` already runs (own tables, own Alembic history,
other modules only through `index.py`). Not eleven services: one engineer, a live product,
and a network hop between things that call each other on every checkout is a cost with no
buyer. The boundaries are what make a module extractable later; the deployment is not.

## 2. The eleven modules, and where each lives today

| Core module | Registration (TS) today | KnowsiaApp (Py) today | Owner after Phase 7 |
|---|---|---|---|
| **Identity & access** | `participants` + `participant_auth`, staff / tutor / company / partner auth tables, `modules/portal`, the handoff | `m1_users`, M1 auth, entitlements ladder | Core |
| **Organisations** | `modules/corporate` (`companies`, seat allocations, company-admin PIN portal) | `app/corporate` (`corp_`) | Core |
| **Payments** | `modules/payments` (Paystack webhook, `payments`, installments, `payment_events`) | `paystack.py`, `m1_payments`, `m1_credit_ledger` | Core — **last** |
| **Catalogue & pricing** | `modules/coupons`, course fees on courses | `m1_plans`, `TIER_FEATURES`, the credit schedule | Core |
| **Affiliates** | `modules/partners` (`codes`, `code_redemptions`, `partner_commissions`, `partner_payouts`, `knowsia_ref_code`) — **the real one** | `m10-affiliate` stub — **retired** | Core |
| **Communications** | Resend engine, `email_templates`, `email_log` / `sms_log` / `whatsapp_log`, sequences, campaigns, `marketing_opt_outs` | lifecycle emails, `notif_`, `email_template.py`, `m1_email_log` | Core |
| **Leads & CRM** | `modules/leads`, `opportunities`, `waitlist_entries`, `POST /api/enquiries`, attribution cookie | the landing-page lead form (posts across the seam) | Core |
| **Support & feedback** | `modules/feedback` (ratings, NPS, testimonials) | — | Core |
| **Files** | ad-hoc uploads | Bunny storage (`core/storage.py`), answer-sheet pages in Postgres, the content-security gate | Core |
| **Audit & consent** | `consent_given` on participants, `marketing_opt_outs` | `AdminAction` (M7), `consent_version` on users | Core (`core_audit_log` since Phase 1) |
| **Analytics & events** | `payment_events` ledger | the KPI service, `m7_model_calls`, a Redis publisher nothing reads | Core (`core_outbox` / `core_events` since Phase 1) |

**Beside Core, as their own services or modules:** the **LMS** (courses, lessons,
enrolments, progress, quizzes, **the certificates registry**, CPD — the founder placed
certificates with the LMS, so the LMS service is the ONE issuer of `KNS-CODE-YEAR-NNNN`
numbers for every credential type, cohort included); the **Question bank & tutor**
(M3/M5/M6/M7); the **AI gateway** (M4); the **Media pipeline** (Knovidia); **Cohort
operations** (Registration's registrations, attendance, live sessions).

Two smaller things ride inside modules rather than standing alone: **RBAC beyond
student/admin/tutor** (inside Identity) and **integrations** (HubSpot, Zoom, Drive, Paystack
transfers — the connector code, inside the module that uses it). **Deliberately not Core:**
the scheduler (infrastructure; every module owns its jobs) and the three heavy services
above (they scale differently and must not take Core down with them).

## 3. Tenancy and identity — the rules

- **Every product is a tenant of Core.** `product` (`study` | `registration` | `corporate`
  | …) on payments, messages, leads and events. One person, one identity, many product
  memberships. Phase 1 added the columns (`m1_payments.product`, `m1_email_log.product`,
  default `study`).
- **One person, SEPARATE app records — no merge, ever.** Core identity = who you are and how
  you sign in (email, phone, credentials, consent, roles). Each product keeps its own rows
  exactly where they are (`m1_users` is Study's profile; `participants` is Registration's)
  and carries the identity id (`m1_users.core_identity_id`, Phase 1). No history is
  rewritten, no attempts or registrations move.
- **Linking is by exact email only**, when Core identities are created (Phase 2, December).
  Different emails → two identities, and the *person* joins them later from their own
  account by proving both logins. Nobody in admin ever guesses that two records are one
  human — that is where the data-protection risk lived.
- **Identity is a key; entitlements live with the product that sells them.** A login
  works everywhere. What you may *use* is each product's own decision from its own
  records — Study's `_effective_tier` (paid → trial → expired), the LMS's enrolments,
  Registration's registrations. Signing in grants nothing. Access that crosses products
  ("this cohort seat includes 90 days of Study") is a GRANT the paying product writes into
  the other product's records: explicit, visible in admin, time-boxed, revocable, audited.
- **Core never knows product objects.** A payment references `product` + an opaque
  `reference`; it never has a foreign key to a course or a question.
- **Two doors, versioned.** `/api/v1/…` for browsers (JWT), `/api/v1/service/…` for other
  apps (`X-Service-Key`). Breaking changes go to `/api/v2/`, never in place.

## 4. The audit log (`core_audit_log`, Phase 1)

Who did what, to which record, in which product. One row per admin or service write
(`actor_id` null for a service call, `actor_role` admin | service | system, `action` such
as `student.trial_set`, `target_type` / `target_id`, `detail` = the arguments the action
was given, never the whole record). Append-only. First writers: the admin students page
(trial set / bulk grant / resend verification) and the Seam III service endpoint (account
created / linked from Registration). Read: `GET /api/v1/admin/audit?target_id=&target_type=
&actor_id=`. Every future admin write records here — it is part of the definition of done
(§8). Consent, export-my-data and delete-my-account requests will hang off the same module.

## 5. The outbox — how a cross-product event is raised (`core_outbox`, Phase 1)

The Redis-stream publisher written in Phase 1 (July) was never read by anything, and it
published AFTER the commit from a background task, so a crash between the two lost the
event and a retry could double it. Three rules now:

1. **A producer writes the event in the SAME transaction as the business write.**
   `app/platform/index.py:enqueue_event_internal(db, …)` adds a `core_outbox` row; the
   caller's commit makes both durable or neither. First producer: `apply_payment` raises
   `PAYMENT_SETTLED` keyed by the Paystack reference.
2. **A consumer is idempotent, and the outbox enforces it.** The worker (scheduler, every
   minute, unconditional) delivers each pending row to every subscribed consumer, writing a
   receipt keyed (consumer, event_type, idempotency_key); a consumer with a receipt is
   skipped, so redelivery is always safe. Each consumer runs in its own savepoint — one
   failing never blocks another. First consumer: `events_ledger`, which copies every event
   into `core_events`, the analytics ledger.
3. **Failure is bounded and visible.** `MAX_ATTEMPTS` (5), then the row is dead-lettered to
   M7's failed-events queue (`/admin/failed-events`) and marked `dead_lettered_at`, so
   "gave up" and "not yet" are distinguishable.

The idempotency key is unique **per event type**: a refund of the same charge is a second
event. The Redis publisher stays for now; nothing new is written to it, and it is removed
when its last caller is.

## 6. Contract tests — how the seam is kept honest

`tests/contracts/test_service_contract.py` (KnowsiaApp) renders the OpenAPI description of
every `/api/v1/service/*` route and compares it to the committed artifact
`shared/contracts/service-api.v1.json`. A change fails CI with the way to accept it —
`UPDATE_CONTRACTS=1 pytest tests/contracts` — which rewrites the artifact and its copy here
at `Coding Docs/contracts/service-api.v1.json`, where `tests/unit/knowsia-core-contract
.test.ts` asserts the four endpoints `modules/knowsia-app/service.ts` calls still exist with
the fields it sends. A breaking change is therefore a diff in review on both sides, never a
422 in production. Thirteen routes pinned on 2026-09-18.

## 7. The roadmap — seven phases, one cutover in flight at a time

Principles: launch is never blocked (nothing touches sign-in before the November pilot ends,
30 Nov); strangler — build in Core → contract-test → point one caller → watch → delete the
old code; every step reversible for 30 days; measure before and after on the KPI page.

| # | Phase | When | Scope | Exit criterion |
|---|---|---|---|---|
| 0 | **Write it down** | done 2026-09-18 | This document; CLAUDE.md and PLAN.md record it. | — |
| 1 | **Foundations** (invisible) | done 2026-09-18 | Tenancy/link columns; the outbox, its worker, first producer (`PAYMENT_SETTLED`) and consumer (`events_ledger`); the audit log with first writers and admin read; contract tests on both repos. | Live: an outbox row goes `published_at` within two minutes of a payment; both CIs run the contract tests. |
| 2 | **Identity link** | built 2026-09-18, dual-read OFF until Dec 2026 | Core identity table; identities created from each app's table; linked by exact email; both apps validate logins against Core AND their own table (dual-read) and log disagreements; RBAC roles; consent / export / delete requests. **Built (all of it, 2026-09-18):** the table, the aliases, the linker (applied: 403 identities), the export/link door on this side (`modules/knowsia-core/`, `participants.core_identity_id`), the shadow check on every path behind `CORE_DUAL_READ`, the log and its reads; roles kept equal to the union of the products' roles and checked in the shadow read; the person-driven join (`/account` in Study, the cohort PIN as proof); consent / export / erasure with a ledger — Study anonymised through its own interfaces, **this app's erasure stays its own admin-only DPA flow** (routed, never bypassed). **Open:** the dual-read switch itself, until 30 Nov. | Disagreement log silent 7 days; PIN login, the handoff and the 312 printed verify URLs unchanged; Registration's user table read-only. |
| 3 | **Low-risk moves** | pulled forward to Sept 2026 (founder, 2026-09-19); Doc 23 is the record | Communications (one template set, send log, consent; sequences/campaigns become callers), Leads & CRM, Support & feedback, Files (one upload path, gate, signed URLs). **Files built 2026-09-19** (`core_files`, one gate, public/private stores, this app's slips through the door). Communications, Support, Leads & CRM follow in that order. | Each: old module deleted, callers on Core, sends / leads / uploads per day unchanged. |
| 4 | **Structure for money** | Feb 2027 | Organisations; Catalogue & pricing (every sellable thing a SKU: plans, sittings, credits, seats, courses; coupons; an FX table; tax treatment); Analytics reading across products; **Affiliates — attribution half** (partners + referral code honoured in every product; M10 deleted). | Every sellable thing has a SKU; the KPI page slices by product; a referral survives a cross-product sign-up in a test. |
| 5 | **Payments** | Mar 2027 | Paystack checkout and webhook into Core; credits ledger; transfer rails. | Webhook flipped; old handler kept 30 days as dead-letter; `m1_payments` reconciled to Paystack's export to the pesewa. |
| 6 | **Affiliates — money half** | Mar–Apr 2027 | Commission derived from `PAYMENT_SETTLED` (never stored ahead of the ledger; refunds reverse through the same ledger), payouts through Core's transfer rails, manual-approve for the first month, statements through Communications. | First commission statement matches a hand calculation. |
| 7 | **Retire the TS backend; split if warranted** | Apr–May 2027 | Cohort operations ported; Registration's Next.js becomes a front end only. Core to its own Railway service only if load or a second team requires it — decided by numbers on the KPI page, not by calendar. | Registration's TypeScript backend has no writers. |

Roughly seven months at one engineer with content work continuing beside it. Phases 2 and
5 are the ones not to rush.

## 8. Definition of done — every Core module, every phase

API v1 contract with tests on both sides · `X-Service-Key` door · `product` on every row ·
own migration history · an audit row for every admin write · idempotency key on every
write endpoint · emits its events through the outbox, never the Redis publisher · a KPI
reads from it · old code deleted, not disabled.

## 9. Explicitly NOT in Phase 1

No change to sign-in, PIN login or the handoff. No identity table yet, no linking, no merge.
No Registration module moved. No Paystack change. The Redis publisher untouched. Nothing a
student can see.

## 10. Risks named up front

- **Identity linking (Phase 2)** is the step with a person on the other side: exact-email
  only, dry-run script read by a human, alias table so every old id still resolves.
- **The Paystack webhook flip (Phase 5)** is where money goes missing if both handlers are
  not idempotent on `reference` — hence the 30-day dead-letter and the reconciliation.
- **Scope creep from product work**: every feature built between now and Phase 7 must be
  built *behind* Core's boundary (write to Core, do not add another users table), or the
  migration grows while it is being done.
