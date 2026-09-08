# Platform Convergence — Course Registration and KnowsiaApp

> **SUPERSEDED IN PART, 2026-09-07.** §2's decision — "integrate the product, do not merge the
> codebases" — was reversed by founder direction: the codebases ARE merging, onto one Python
> backend and one Next.js frontend. See `21_Codebase_Consolidation.md` for the plan, the measured
> scope and the phase order. **The rest of this document still governs**, and §3's ownership table
> is now the module map for that migration — it still decides where a new feature goes until the
> module it belongs to has moved. §4's seams remain the interim mechanism and are still being
> completed; §5's definition of "integrated" is now a milestone on the way rather than the end state.

**Status:** Approved direction (2026-08-13), §2 superseded 2026-09-07
**Owner:** Knowsia Operations and Engineering
**Scope:** How the two Knowsia codebases relate, which one owns what, and how they integrate.
**Applies to both repos.** This document lives here; KnowsiaApp needs a mirror of §3 in its own
CLAUDE.md, or the boundary only binds one side. See §8.

---

## 1. The Situation

There are two separate systems, two separate git repositories, and one customer.

| | **Course Registration** (this repo) | **KnowsiaApp** (`github.com/kwameaikins/KnowsiaApp`) |
| --- | --- | --- |
| Stack | Next.js 15, Supabase, Vercel | FastAPI / Python 3.12 + Next.js 15, Railway, Supabase Pro, Upstash, Celery |
| Business model | B2B cohort training, per-course fee | B2C subscription, 14-day trial, tiers |
| Identity | `participants` + PIN/session-cookie portals | `m1_users` + JWT RS256, roles, trials |
| Maturity | **Live.** Real money, real cohorts, real data — 267 ESG registrants, 101 legacy certificates, production bugs found and fixed against live traffic | **Built, never launched.** 272 tests pass, but no live keys: Cloudflare Stream unverified, Grok unexercised, notification senders stubbed |

They serve the same person. A Ghanaian accounting professional who takes an ESG cohort here is
precisely the person who subscribes for ICAG exam preparation there. Without integration that
person has two accounts, two logins, and two certificate systems.

---

## 2. The Decision

**Integrate the product. Do not merge the codebases.**

Porting either system into the other means rewriting Python ML/RAG/Celery into TypeScript, or
abandoning a shipped registration surface that is days from go-live. Both cost months and end with
less than exists today, while the only system earning money sits frozen.

Rejected alternatives, for the record:

- **Consolidate into KnowsiaApp.** Cleanest end state, but it moves live revenue onto code that has
  never been exercised against a real integration. 272 green tests against stubbed providers is not
  the same class of evidence as a system that ran a 267-person class and surfaced three independent
  attendance bugs in production.
- **Consolidate into Course Registration.** One language and one deploy target, but it discards most
  of the built Python — M2 LMS, M5 marking, M6 analytics, M9 tutor marketplace, `corp_`, `notif_` —
  and rebuilding the question bank here is exactly the duplication this decision exists to stop.

---

## 3. The Boundary — the operative rule

> **People and money → Course Registration. Learning content and AI → KnowsiaApp.**
>
> **Neither system rebuilds the other's half.** A capability has exactly one owner. If a feature
> request lands on the wrong side of this line, it moves — it is not implemented twice.

### Ownership

| Capability | Owner | Note |
| --- | --- | --- |
| Participant identity, portals, PIN auth | **Registration** | System of record for who a person is |
| Payments, invoicing, installments, discounts, credit redemption | **Registration** | Live Paystack webhook, BR-14 idempotency, refined through production |
| Cohort registration, batches, capacity, waitlist, transfers | **Registration** | BR-01..BR-44 encode real operational learning |
| Certificates and public verification | **Registration** | `KNS-` numbering continues a legacy AppScript counter; `/verify` URLs are already printed on 101 issued certificates and cannot move |
| Corporate seat allocations and company portal | **Registration** | Real companies buying real seats |
| Partners / affiliate / coupons | **Registration** | Four partner tiers, commission ledger, credit redemption |
| CRM, leads, campaigns, sales pipeline | **Registration** | Revenue OS |
| Email / SMS / WhatsApp / voice | **Registration** | Resend DNS-verified, Arkesel, Meta templates, Vapi |
| Live classes and attendance | **Registration** | Documents 14 and 18 |
| Knowsia Insights (public news) | **Registration** | Document 17 |
| Question bank, mock exams, attempts | **KnowsiaApp** | M3 |
| AI tutor, RAG, explanations, institutional facts | **KnowsiaApp** | M4 — permanent separate service, ML models at startup |
| Self-paced LMS, video lessons | **KnowsiaApp** | M2. Video delivery is **Bunny Stream** (founder decision 2026-08-23) — the Knovidia production pipeline already hosts course video there with a working agent; this supersedes M2's original Cloudflare Stream choice, which was built but never went live. Details in KnowsiaApp's CLAUDE.md §Video hosting |
| Topic mastery, spaced repetition, study plans, pass-readiness | **KnowsiaApp** | M6 |
| Essay marking | **KnowsiaApp** | M5 |
| Subscriptions, trials, tier gating | **KnowsiaApp** | Different commercial model from per-course fees; both can coexist |

### Stop building these in KnowsiaApp

Each was already deferred or stubbed there, and each exists shipped and working here. The boundary
largely draws itself:

- **M10 Affiliate** — deferred to Phase 4 there; shipped here with four partner categories.
- **M11 CRM** — deferred there (HubSpot Free); shipped here as Revenue OS.
- **`notif_` email/SMS/WhatsApp senders** — pluggable stubs pending keys there; live here.

### The four genuine conflicts

Everything else is owned by exactly one side already. These four exist on both and were decided
deliberately:

1. **Certificates** — Registration. Public `/verify` URLs are already in circulation on issued
   certificates. This is not a preference; moving it breaks printed documents.
2. **Corporate** — Registration. Real companies have bought seats against it.
3. **Payments** — Registration for course fees; KnowsiaApp keeps its own subscription billing. Two
   commercial models, one provider (Paystack), no shared code required.
4. **Tutors** — **not actually the same concept.** Registration's tutors *teach your cohorts*.
   KnowsiaApp's M9 is a *marketplace* where tutors sell their own courses. Both may exist. Do not
   merge them without deciding first whether Knowsia is running a marketplace at all.

---

## 4. Integration Sequence (founder-ordered 2026-08-13)

**I — Account link and handoff token.** — **Registration half BUILT 2026-08-13** (migration written,
not yet applied; dormant until configured). Link `participants` to `m1_users`; a short-lived
handoff token lets a session on one side open an authenticated session on the other. Pure plumbing,
no product change, and it is the prerequisite for everything after it. Deliberately *not* full SSO —
account linking is days of work and can be upgraded later if it is ever genuinely needed.

Design constraints, inherited from existing rules on both sides:
- Who the token is for comes from the **existing authenticated session**, never from a request body.
  Same rule as `POST /api/portal/enrol` here and the `X-Service-Key` pattern there.
- Short TTL. KnowsiaApp's own cookie TTL is 900 seconds and must match its JWT exactly; a handoff
  token should be far shorter — single-use, seconds not minutes.
- Neither system reads the other's database. HTTP only. This is Rule 2 there and the module
  boundary rule here, and it does not stop applying at a process boundary.

As built: an **opaque single-use token plus a service-key callback**, not a self-contained JWT.
That is this repo's existing pattern twice over (`portal_login_tokens`,
`participant_pin_reset_tokens`), needs no new dependency, and is genuinely single-use — which
matters because the token travels in a URL query string and will land in KnowsiaApp's logs and the
student's browser history. Redeeming it *also* requires `KNOWSIA_APP_SERVICE_KEY`, so an
intercepted token alone is worth nothing; a self-contained JWT would have been replayable for its
whole TTL. TTL is 60 seconds. Full rules in BR-45; endpoints in Document 5 §18; schema in
Document 3 §16.

**KnowsiaApp half BUILT 2026-08-23:** `/auth/handoff` (frontend route sets its
httpOnly cookies) → `POST /api/v1/auth/handoff` (calls verify with the shared
key, finds-or-creates `m1_users`, stores `m1_users.knowsia_participant_id`
(migration auth/008), calls link, issues its normal token pair). Refuses on a
link conflict (409). Dormant until `COURSE_REG_API_URL` +
`COURSE_REG_SERVICE_KEY` are set over there and `KNOWSIA_APP_URL` +
`KNOWSIA_APP_SERVICE_KEY` here.

**Seam III BUILT on both sides 2026-08-23 — and made DELIBERATE, not
automatic, the same day (founder rule):** a live-cohort seat and
recorded-course access are separate commercial decisions, so nothing fires
on the Paid transition. Staff (admin/management) grant a participant the
recordings explicitly and TIME-BOXED via
`POST /api/registrations/[id]/lms-access {days}` (button in the
registration detail dialog) → `grantLmsAccess` in
`modules/knowsia-app/service.ts` → KnowsiaApp's
`POST /api/v1/service/lms/enrolments` (X-Service-Key, `access_days` →
`m2_course_enrolments.expires_at`, enforced at playback; re-granting
restates the period). Course matching is by m2 course slug == course_code
lowercased. A 409 back to staff means the course has no imported videos
yet. Separately, anyone may simply BUY the other mode: the /learn
storefront routes live CTAs to /register and self-paced CTAs to LMS
enrolment.

**Seam II wiring in place:** `next.config.ts` rewrites `/learn/:path*` to the
KnowsiaApp frontend, gated on `KNOWSIA_APP_FRONTEND_URL`.

> **Amendment 2026-09-04 — mechanism changes, goal stays.** Founder direction: the Course
> Registration app moves to `knowsia.com`, KnowsiaApp moves to `app.knowsia.com`, WordPress is
> retired. "One apparent product" is then delivered by shared branding and the handoff, not by a
> path rewrite; the `/learn` rewrite becomes a permanent redirect. Plan, URL map, SEO safeguards
> and phase checklists: `Coding Docs/20_Domain_Consolidation_and_WordPress_Retirement.md`.

**II — One domain and shared navigation.** Both frontends are Next.js on Vercel, so path-based
rewrites give one apparent product without either codebase knowing about the other. Cosmetic, no
data change, but it is what makes the two systems *feel* like one to a customer.

**III — Paid cohort grants question-bank access.** A registration reaching Paid here grants that
person question-bank access there for the course duration. The first integration with real product
value, and a genuine cross-sell: cohort students become subscription prospects.

Mechanically this hangs off `runPaidTransitionSideEffects`, which is already the single place every
paid-transition consequence is wired (welcome email, WhatsApp invite, lead transition, partner
commission accrual). It does not need a new trigger — it needs one more side effect. Fire-and-forget
and idempotent, matching the rule on both sides.

**Status 2026-09-04 — NOT BUILT, and the gap is now visible to real users.** Seams I and II are
live: a cohort student signs into `reg.knowsia.com/learn` with their portal email/mobile + PIN, and
KnowsiaApp creates their `m1_users` row with no trial (`trial_used = true`, `student_tier = 'free'`
— deliberately, so the cohort purchase does not burn their one trial). Without III nothing ever sets
their access, so KnowsiaApp's `GET /api/v1/questions` answers **402 Payment Required** and the
Practice Questions page shows "Could not load questions. The study service may be unavailable".
Confirmed in KnowsiaApp's Railway logs: `pin-login 200 → auth/me 200 → questions 402`, on every
retry. Two consequences for this repo when III is built: (a) the grant must carry an explicit period
(course duration), never an open-ended tier change; (b) BR-45 still holds — the handoff/PIN verify
payloads stay identity-only, and the grant travels as its own service-key call from
`runPaidTransitionSideEffects`, exactly as the LMS enrolment grant already does.

> **Update 2026-09-05 — the KnowsiaApp half is BUILT; this repo's half is still open.**
> KnowsiaApp now exposes `POST /api/v1/service/auth/question-bank-access` (header
> `X-Service-Key`; body `{email, name?, phone?, participant_id?, access_days (1–730, required),
> source?}` → 201 `{user_id, access_until, tier, extended}`) and
> `POST /api/v1/service/auth/question-bank-access/revoke` (`{email? | participant_id?}`).
> It finds-or-creates the `m1_users` row (no trial, no password — same as the PIN login), sets
> `m1_users.question_bank_access_until`, and while that is in the future every KnowsiaApp gate
> treats the person as `standard`. Idempotent: a repeat with a shorter or equal period answers
> `extended: false` and changes nothing, so fire-and-forget retries are safe. Consequences (a)
> and (b) above are honoured on that side: the period is mandatory, and the grant is its own
> call. **To finish Seam III here:** add a `grantQuestionBankAccess({email, name, phone,
> participantId, accessDays: <course duration in days>, source: <course_code>})` helper beside
> `grantLmsAccess` in `modules/knowsia-app/service.ts` and call it from
> `runPaidTransitionSideEffects` (and the revoke on refund / cancellation). Until then the
> KnowsiaApp question page shows the real reason ("your free trial has ended … On a Knowsia cohort
> course? … contact info@knowsia.com") instead of "service unavailable".

---

## 5. What "Integrated" Means Here

Explicitly, so it is not mistaken for a bigger promise:

- One login that reaches both products.
- One apparent product under one domain.
- A cohort purchase that unlocks study material without anyone re-keying anything.

It does **not** mean one database, one repository, one deployment, or one language. Those were
considered and rejected in §2.

---

## 6. Budget — restating honestly

This repo's CLAUDE.md states `$0/month` as a non-negotiable, with small metered exceptions
(Arkesel, Vapi, Anthropic). **If these two systems are one business, that constraint is already
being exceeded**, on the KnowsiaApp side: Railway (2 services), Supabase Pro, Upstash, Cloudflare
Stream (~$32/month), PostHog, Sentry.

The rule is therefore restated rather than quietly violated: **$0/month still governs this repo.**
New paid services here still require approval. KnowsiaApp runs its own, already-accepted
infrastructure budget. Neither may commit the other to spend.

This does not reopen the Knowsia Live decision in Document 18. That was declined on two grounds —
~570 GB egress per 500-person session, and a product that has not launched. The second ground is
now *stronger*, not weaker: there are two unlaunched things competing for attention, not one.

---

## 7. Sequencing Against Everything Else

Nothing in §4 starts before this repo clears its Paystack test-mode gate and goes live. The
integration work is small, but it is not more urgent than taking the first real payment.

The immediately valuable part of this decision costs nothing and applies today: **stop building the
same capability twice.** That is available the moment §3 is agreed, which it now is.

---

## 8. Open Items

1. **Mirror §3 into KnowsiaApp's CLAUDE.md.** A boundary written in one repo binds one repo. Until
   that mirror exists, a KnowsiaApp session has no reason not to build an affiliate module.
2. **Repo layout.** KnowsiaApp was briefly nested inside this working tree (untracked — a `git add .`
   would have swallowed it) and is being relocated to a sibling directory.
3. **Marketplace question.** Whether Knowsia runs a tutor marketplace at all (M9) is an unanswered
   product question, not an engineering one. It determines whether the two tutor concepts in §3
   ever converge.
4. **Which Supabase project(s).** Both use Supabase. Whether they share one project or two is not
   recorded and should be. It did **not** block Seam I's Registration half — the design never
   crosses databases, so the answer only matters for operational questions (backups, connection
   limits, blast radius), not for the integration itself.
5. ~~Migration `202608130061` is written but not applied.~~ **Applied to production 2026-08-13 and
   verified present in `supabase migration list`** (62 migrations, 0 pending). Note the ordering is
   the safe one: the schema now accepts the link while no deployed code writes it yet, since the
   integration stays dormant until `KNOWSIA_APP_URL` and `KNOWSIA_APP_SERVICE_KEY` are set. Same
   schema-ahead-of-app ordering as `202608120060`.

---

*Extends nothing; governs both repos. Read with `Coding Docs/CLAUDE.md` (this system's rules) and
KnowsiaApp's own CLAUDE.md (that system's rules). Where a rule in either conflicts with §3, §3 wins.*
