# CLAUDE.md

This file is read automatically at the start of every session. It is the single source of
truth for how to work on this codebase. It does not replace the 12 documents in `/docs` —
it tells you which one to read for what, and states the rules that apply regardless of
which task you are doing.

---

## Project

**Centralised Course Registration & Follow-Up System** — an internal web application
replacing scattered Google Forms and Sheets for a Ghana-based training business. Manages
registrations, payments (Paystack card + MTN MoMo + bank transfer), automated participant
email communication, and role-based staff access across 48 course intakes per year.

This is an internal operations tool for one business. It is not a public product, not an
LMS, and not multi-tenant. See `/docs/01_PRD.md`, Section 9 ("Out of Scope") before adding
any feature not already specified.

---

## Before you write any code

Read the relevant document(s) below. Do not implement a feature from memory of a prior
conversation — re-read the spec every time, because it is the authoritative source, not
your summary of it.

| Task | Read first |
|---|---|
| Any new feature or screen | `/docs/01_PRD.md` — find the Feature ID (F1.xx), read its full spec |
| Database, schema, migrations | `/docs/03_Data_Schema_and_ERD.md` — full SQL, triggers, RLS |
| Business logic, validation, edge cases | `/docs/04_Business_Logic_Rules.md` — BR-01 through BR-19 |
| API routes | `/docs/05_API_Contract.md` — exact request/response shapes |
| Auth, RLS, secrets | `/docs/06_Security_and_Authentication.md` |
| Paystack, Resend, Supabase, Sentry, Uptime Robot | `/docs/07_Integration_Specifications.md` |
| UI screens, components, signifiers | `/docs/08_UIUX_Screen_Specification.md` |
| Writing or running tests | `/docs/09_Test_Specification.md` |
| What to build this week | `PLAN.md` (this repo root) — the live checklist |
| Naming, file structure, conventions | `/docs/11_Coding_Standards_and_Conventions.md` |
| How the founder will prompt you | `/docs/12_Agent_Prompt_Engineering_Guide.md` |

---

## Stack (do not substitute without asking)

- **Framework:** Next.js 14+, App Router, TypeScript strict mode
- **Database/Auth:** Supabase (PostgreSQL + Auth + Row Level Security)
- **Email:** Resend
- **SMS:** Arkesel (approved 2026-07-19; ~GHS 0.029/SMS pay-as-you-go — accepted budget exception)
- **Attendance:** Zoom Server-to-Server OAuth (approved 2026-07-19; free with existing Zoom plan)
- **Admin assistant:** Anthropic Claude API (approved 2026-07-19; pay-per-use — accepted budget exception)
- **Voice calls:** Vapi (approved 2026-07-19; ~$0.05–0.15/min, targeted triggers only — accepted budget exception)
- **Payments:** Paystack (Card + MTN MoMo)
- **UI:** Shadcn/ui + Tailwind CSS (components copied in via CLI, not npm-installed)
- **Hosting:** Vercel (including Vercel Cron for scheduled jobs)
- **Monitoring:** Uptime Robot (uptime) + Sentry (errors)
- **Budget constraint: $0/month.** Do not introduce any paid service without asking first.

---

## Non-negotiable rules

These apply to every task, regardless of what is being built.

1. **Module boundary rule (`/docs/02_Technical_Architecture.md`, Section 4 & 11):**
   `app/` → `modules/*/service.ts` → `modules/*/repository.ts` → `lib/supabase`.
   No page or API route calls `supabase.from(...)` directly. No repository file contains
   business logic. No module reads another module's tables directly — only through its
   exposed service functions. The one exception: every module may call
   `modules/communications/service.ts` to send email.

2. **Glossary discipline (`/docs/01_PRD.md`, Section 3):** Use `Participant`, `Registration`,
   `Batch`, `Payment Status`, etc. exactly as defined. Never rename or abbreviate a domain
   term in code, comments, or commit messages.

3. **Never set `payment_status` or `registration_status` directly.** They are derived by
   database triggers (BR-04, BR-06). Application code only ever writes `amount_paid`.

4. **Never set `verified_by` from client input.** It is always the current session's staff
   ID, set server-side (BR-12).

5. **RLS is the real security boundary, not the middleware.** Every new table needs RLS
   enabled with explicit policies before it is used — no table is ever left with default-
   allow access, even temporarily during development.

6. **Idempotency is mandatory** for the Paystack webhook (BR-14) and every email send
   (BR-07) — both are backed by database unique constraints, not just application checks.

7. **No secret in code or git history.** All keys are Vercel environment variables. If one
   is ever committed, rotate it immediately — do not just remove it from a later commit.

8. **No `localStorage`/`sessionStorage` for auth or PII, ever.**

9. **Ghana DPA compliance features (consent checkbox, soft/hard delete) are not optional
   and not deferrable** — unlike every other Should-Have/Could-Have feature, these ship in
   Phase 1 with no exceptions (`/docs/10_Implementation_Plan.md`, Section 4).

10. **If a request conflicts with any of the 12 documents, say so before proceeding.**
    Do not silently pick one interpretation. Ask, or flag the conflict and propose a
    resolution, per `/docs/12_Agent_Prompt_Engineering_Guide.md`, Section 5.

---

## Commands

```bash
npm run dev                 # local dev server
npm run build                # production build
npm run lint                 # lint check — run before every commit
npx supabase start           # local Supabase instance for integration tests
npx supabase db push         # apply migrations to the linked project
npx supabase gen types typescript --local > lib/supabase/database.types.ts
npm run test                 # Vitest unit + integration tests
npx playwright test          # E2E tests (Section 6, Document 9)
```

---

## Current status

> Update this section at the end of every session. This is the fastest way for a new
> session (or a new context window) to know where things stand without re-reading everything.

```
Week (per PLAN.md):     5 (Tasks 1–5 code-complete; live integrations pending)
Last completed task:    (2026-07-19) knowsia.com DNS-verified in Resend; live test send
                        returned 200. Root-caused two live issues: (1) no registration
                        emails — email_templates table was EMPTY, every send exited
                        skipped_no_template; seeded 7 Phase 1 templates × 2 courses
                        directly in Supabase (payment_instruction has no real bank
                        details yet — founder must edit). (2) two successful GHS 1.00
                        Paystack MoMo charges (refs REG-f7660596…, REG-d10b3f56…) never
                        reached the app — webhook URL not yet configured in Paystack
                        dashboard; both payments since reconciled to Paid (founder-
                        approved) with confirmation emails sent — webhook URL still
                        needs configuring. Also fixed confirmation message to show Course
                        name not cohort label (Doc 1/5 drift). SMS integration built
                        (Arkesel — Doc 7 Section 8; deployed; founder added real API
                        key + sender ID locally, Vercel env vars still pending). Then
                        three features built in one pass (all founder-approved, Doc 7
                        Sections 9–10, PLAN Task 3): (1) Zoom attendance "Option 2" —
                        migration 202607190007 applied, personal join links on Paid,
                        nightly report sync cron 21:00 UTC, Attendance screen;
                        (2) Admin Messaging screen editing all email templates
                        (16 rows seeded incl. zoom_link); (3) Admin AI assistant
                        (claude-opus-4-8 tool runner over existing services) at
                        /assistant. (4) Post-course feedback app: public form at
                        /feedback/<registration-uuid>, dispatch via 07:00 cron
                        day after batch end_date (post_training_thankyou email,
                        certificate-for-feedback incentive), review screen at
                        /course-feedback; migration 202607190008 applied.
                        (5) Agentic voice calls via Vapi (Doc 7 Section 11):
                        all six call types, call_log migration 202607190009
                        applied, dispatch in 07:00 cron with 10:00 Ghana
                        calling window, webhook + tools endpoints, Calls
                        review screen; dormant until VAPI_* env vars set.
                        113 unit tests, tsc + lint + next build green;
                        this batch NOT yet committed/deployed. Founder put a
                        real ANTHROPIC_API_KEY in local .env — still needed in
                        Vercel, along with ARKESEL_*, ZOOM_*, VAPI_* vars.
Currently in progress:  External setup checklist (see the process guide given to founder
                        2026-07-19): Resend DNS records, Vercel env vars, Paystack webhook
                        URL, Sentry DSN, Uptime Robot, Meta WhatsApp, staff accounts, then
                        live tests T-INT-01…06.
Blockers:                (1) Exposed legacy server keys must be revoked after an unexposed
                        replacement is deployed. (2) .env holds Paystack LIVE keys, but the Week 2 gate calls for
                        a TEST-mode end-to-end payment first — get test keys or accept a
                        small real charge deliberately. See Doc 4 EC-07…EC-10.
Pivot-or-persevere gate status: Not yet reached (needs live Paystack test)
```

---

## When something isn't covered by the docs

Check `/docs/04_Business_Logic_Rules.md`, Section 3 (Edge Cases) first. If the situation
still isn't covered:

1. Do not guess silently.
2. Propose a resolution consistent with the existing patterns (aggregate ownership,
   idempotency, RLS-first security) and ask the founder to confirm.
3. Once confirmed, add it to Document 4's Edge Cases table yourself, so the next session
   doesn't hit the same gap. Documentation and code must never silently drift apart.

---

*Full documentation suite: `/docs/01_PRD.md` through `/docs/12_Agent_Prompt_Engineering_Guide.md`.*
*Live task tracker: `PLAN.md`.*
