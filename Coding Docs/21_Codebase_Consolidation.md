# Codebase Consolidation — one Python backend, one Next.js frontend

**Status:** Approved direction (2026-09-07) — **supersedes the "do not merge the codebases"
decision in `19_Platform_Convergence.md` §2.** Everything else in Doc 19 still stands, including
the ownership table in §3, which becomes the module map for the migration rather than a
boundary between two systems.
**Owner:** Knowsia Operations and Engineering
**Applies to both repos.** KnowsiaApp needs a mirror of §3 and §4 in its own CLAUDE.md.

---

## 1. The decision, and why it changed

Founder direction 2026-09-07: **one codebase — Python (FastAPI) for the backend, Next.js for the
frontend.** Course Registration's TypeScript business logic is ported into KnowsiaApp's Python
API; the two Next.js frontends become one.

Doc 19 rejected exactly this on 2026-08-13, for one stated reason: it "moves live revenue onto
code that has never been exercised against a real integration. 272 green tests against stubbed
providers is not the same class of evidence as a system that ran a 267-person class".

**That objection has weakened.** KnowsiaApp went to production on 2026-09-07 (Railway
`fe972392`): 748 tests, real content — 2,434 published questions, live migrations across nine
Alembic histories, and student-facing features in daily use.

**It has not disappeared.** Course Registration still holds everything that touches money:
live Paystack webhooks, 312 issued certificates, corporate seat allocations, partner commission
ledgers, and cohorts running now. The migration is therefore sequenced so that **money moves
last**, and nothing moves before the thing that replaces it has been observed working.

---

## 2. What is actually being moved

Measured 2026-09-07, excluding `node_modules` and `.next`:

| Course Registration | Files | Lines |
|---|---|---|
| `modules/` — business logic, 28 modules | 115 | 29,113 |
| `lib/` — 15 integrations | 42 | 7,341 |
| `app/` — routes and UI | 273 | 25,728 |
| `components/` | 26 | 2,072 |
| `supabase/migrations/` | 68 | 4,334 |
| `tests/` | 66 | 16,391 |

Against KnowsiaApp: 231 Python files / 26,072 lines, plus ~12,400 lines of frontend.

So roughly **64,000 lines of application code** change language. The 28 modules are not
uniform: `payments`, `registrations`, `certificates`, `partners`, `corporate`,
`communications`, `live-sessions`, `news-insights` (an 8-agent pipeline) and `voice` each carry
real operational learning encoded as business rules (BR-01..BR-45).

Fifteen integrations are re-implemented in Python: Paystack, Arkesel, Resend, WhatsApp Cloud
API, Vapi, Zoom, Cloudflare R2, Supabase auth, plus the internal portal/certificate/calendar
libraries.

---

## 3. Method — strangler fig, never a rewrite

A big-bang port freezes the only system earning money for months and lands with no way back.
Instead, each module moves on its own, in this shape:

1. **Port** the module's logic into `knowsia-api` as a new `app/<module>/`, with its own Alembic
   history and its `index.py` public interface — the existing module rules apply unchanged.
2. **Migrate** its tables, keeping the live ones as the system of record until cutover.
3. **Dual-run**: both implementations execute, outputs compared, only the old one has effect.
4. **Cut over** behind a flag, one module at a time.
5. **Delete** the TypeScript. A module is not "done" until its old code is gone — two live
   implementations of one rule is the failure mode this whole document exists to avoid.

### Two things that must never break

- **`/verify/KNS-…` URLs are printed on 312 issued certificates** and on every one issued from
  here on. They are in people's hands and in employers' files. The path, the numbering and the
  response must survive the migration byte-for-byte.
- **Paystack webhooks.** BR-14 idempotency was refined against production traffic. The endpoint
  must keep answering throughout, whichever side owns it.

---

## 4. Order of migration

Lowest risk first; money last. Each phase is independently shippable and independently
reversible.

| # | Phase | Why here |
|---|---|---|
| 0 | **Finish Seam III + domain (Doc 20 Phase 1)** | Not migration work — it fixes paying students hitting 402 today, and none of it is wasted: after the merge the service call becomes an internal function call. |
| 1 | **One frontend** | Both are already Next.js. Largest visible win, no financial risk, and it is what delivers the single study platform the founder asked for. |
| 2 | **Low-risk modules** — news-insights, feedback, waitlist, dashboard, marketing-consent | Real ports with real complexity, nothing financial. This is where the porting patterns get established. |
| 3 | **Identity** — `participants` folds into `m1_users` | One account, one login. Seam I's link table becomes the migration map. |
| 4 | **Communications** — Resend, Arkesel, WhatsApp, Vapi | Self-contained senders; KnowsiaApp's `notif_` stubs are replaced rather than duplicated. |
| 5 | **Programme operations** — courses, batches, live-sessions, attendance, tutors, assignments | Large, but no money moves. |
| 6 | **Certificates** | Moves only once `/verify` has been proven identical under dual-run. |
| 7 | **Money** — payments, coupons, partners, corporate, registrations, opportunities, leads, campaigns | Last, deliberately. |
| 8 | **Decommission** | Course Registration repo becomes history; domains point at one app. |

---

## 5. Standing rules during the migration

- **Doc 19 §3's ownership table still decides where a NEW feature goes.** Until a module has
  migrated, it is built where it lives today. Nothing is built twice.
- **No feature freeze.** The business keeps running; a migration that demands one will not
  finish.
- **Each phase carries its tests across.** 16,391 lines of TypeScript tests encode the
  operational learning; the Python port inherits the assertions, not just the behaviour.
- **`$0/month` still governs this repo** (Doc 19 §6) until it is decommissioned.

---

## 6. Open questions for the founder

1. **Question-bank access period.** Seam III now grants a paid cohort participant question-bank
   access for **180 days** (`QUESTION_BANK_ACCESS_DAYS`). Doc 19 said "course duration", but a
   batch runs 2–5 days, which is not a cross-sell. 180 is a placeholder awaiting a commercial
   answer.
2. **Revoke on refund/cancellation.** `revokeQuestionBankAccessSystem` is built but **not
   wired** — there is no single service-layer transition to `Cancelled`/refunded to hang it on,
   and guessing wrong would strip access from paying students.
3. **Two logins today.** `/portal` (registration) and `/learn` (study) have separate
   credentials. Phase 3 resolves this; until then the naming stays as it is.
