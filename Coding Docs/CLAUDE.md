# CLAUDE.md

This file is read automatically at the start of every session. It is the single source of
truth for how to work on this codebase. It does not replace the 15 documents in `Coding Docs` —
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
| Any new feature or screen | `/docs/01_PRD.md` — find the Feature ID (F1.xx) if one exists, else check for a trailing "Extension" section pointing at a companion doc (the convention used for every major feature added since the original PRD — Revenue OS, Live Learning Operations, Corporate Registration) |
| Live sessions, Zoom delivery, attendance review, recordings, tutor/student learning workflows | Coding Docs/14_Live_Learning_Operations.md |
| Corporate registration, seat allocations, company portal | Coding Docs/15_Corporate_Operations.md |
| Tutor portal, tutor management, facilitator assignment | Coding Docs/16_Tutor_Operations.md |
| Database, schema, migrations | `/docs/03_Data_Schema_and_ERD.md` — full SQL, triggers, RLS |
| Business logic, validation, edge cases | `/docs/04_Business_Logic_Rules.md` — BR-01 through BR-30 |
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

10. **If a request conflicts with any of the 14 documents, say so before proceeding.**
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

Built & deployed (all committed, tests/tsc/lint/build green throughout):
  Phase 1 core — registration, Paystack payments + webhook, email engine
    (7 types), Resend DNS-verified and live.
  WhatsApp (Meta Cloud API) — dormant until WHATSAPP_ACCESS_TOKEN +
    WHATSAPP_PHONE_NUMBER_ID are set and templates are Meta-approved.
  SMS (Arkesel) — dormant until ARKESEL_API_KEY + ARKESEL_SENDER_ID are
    set in Vercel (founder has them locally).
  Zoom attendance ("Option 2") — personal join links on payment → Paid,
    nightly 21:00 UTC report sync, Attendance screen. ANTHROPIC_API_KEY
    and Zoom credentials confirmed set in Vercel as of 2026-07-20 —
    treat as live pending a real end-to-end check.
  Admin Messaging screen — edit every per-course email template in-app.
  Admin AI Assistant (/assistant) — claude-opus-4-8 tool runner over
    modules/agent-tools, the shared tool registry (see below). Write-capable
    actions use propose-then-confirm: any write-confirm tool only ever
    prepares a confirmation card — the model has no tool that executes a
    write. Only the admin's own "Confirm & Execute" click calls
    POST /api/assistant/execute-action, which delegates to the wrapped
    service function and logs to staff_action_audit_log (migration
    202607260029, CHECK constraint dropped in 202607260030 — both applied
    to production 2026-07-26).
  Unified agentic OS (2026-07-26) — modules/agent-tools is the one shared
    tool registry every AI surface (the Admin Assistant and the Vapi
    voice-tools endpoint) draws from and dispatches through. Each tool
    declares its own trust tier (staff roles, or 'system' for Vapi's
    shared-secret callers) enforced by the registry itself regardless of
    whether the wrapped service.ts function also gates internally — this
    closes a real gap several modules had (role checks only at the
    app/api/**/route.ts layer). modules/staff-actions was folded in and
    deleted. Write-confirm tools: discount, installment_plan, transfer,
    propose_cancel_or_reschedule_live_session, propose_revoke_certificate,
    propose_queue_and_send_campaign, propose_update_lead,
    propose_create_opportunity. Adding a new write-confirm tool is now just
    registering an object in modules/agent-tools/registry.ts — no schema
    migration needed.
  Post-course feedback — public form at /feedback/<registration-uuid>,
    dispatch via the 07:00 cron the day after a batch's end_date,
    review screen at /course-feedback.
  Agentic voice calls (Vapi) — six call types, 10:00 Ghana calling
    window, webhook + tools endpoints, Calls review screen; dormant
    until VAPI_* vars are set and the Vapi assistant is configured.
  Certificate system — replaces the Google Sheets/AppScript registry.
    KNS-<CODE>-<YEAR>-<NNNN> numbering continuing the legacy AppScript
    counter as a floor; on-demand pdf-lib generation with the real
    logo + both signatories embedded; QR-coded /verify/<number> (plus
    a /verify landing page with a lookup form); batch issuance
    (Paid + feedback eligibility, admin-approved) and manual issuance
    with legacy KNW backfill; all 101 legacy certificates imported.
  Course/catalog hardening — courses carry certificate metadata
    (hours/description/CPD) + editable via the Courses screen; default
    email templates auto-seed on course creation (closes the
    "new course silently sends no email" trap for good); 11-course
    catalog imported from the founder's CSV.
  Brand assets — real logo as favicon + on all public page headers
    (components/KnowsiaHeader.tsx) + email headers; "View our courses"
    lead-gen link on both verify pages.
  Public registration & portal self-service (2026-07-24) — mobile-
    optimized registration form (required Job Title/Company, N/A guidance);
    student portal gained self-service Pay Now (any outstanding balance,
    any time) and self-service name correction (retroactively fixes
    already-issued certificates too, since PDFs are generated on demand,
    never stored); CSV export on the staff Registrations/Payments screens;
    a .ics calendar invite attached to the welcome email; admin-only
    batch/cohort transfer (keeps the original locked-in fee, re-registers
    Zoom if already Paid).
  Batch capacity, waitlist, and payment installments (founder-approved
    2026-07-24) — a full batch's public submission becomes a waitlist
    entry instead of a Registration (same form, same endpoint); automatic
    seat-freed promotion email; admin waitlist visibility on the Courses
    screen; portal self-service "pay half now, half later" payment plan,
    reconciled automatically against the aggregate payments row (which
    stays the sole BR-04/05/06 source of truth), with its own reminder
    email. A staff discount granted after a plan is set up now rebalances
    the schedule too (never below what's already been paid on either
    installment).
  Revenue OS (2026-07-25) — leads module with automatic scoring, an
    activity/audit log, and follow-up due dates; sales pipeline/
    opportunities tied into the executive dashboard; lead assignment rules
    by source; a campaign workspace (dry-run Queue, audience preview,
    logged members) with live guarded email (Resend) and SMS (Arkesel)
    sending — per-channel toggle, separate Send action, 100-recipient cap,
    typed `SEND <count>` confirmation; WhatsApp dispatch still disabled
    pending Meta credentials/templates. See `Coding Docs/13_Revenue_OS_Integration_Plan.md`.
  Lead system hardening + automation (2026-07-26) — status/leadSource are
    real enums with a DB CHECK constraint (added a "Lost" status);
    PATCH /api/leads/[id] is now schema-validated; a second intake matching
    an existing lead's email merges into it instead of duplicating; a lead
    now auto-transitions to Enrolled when its registration's payment clears
    (wired into runPaidTransitionSideEffects); a waitlist join now also
    captures a lead; runFollowUpDispatch (bundled into the existing 07:00
    reminders cron — Vercel Hobby's two-job cap is already fully used)
    emails each due lead's assigned staff a templated nudge, sharing one
    server-side "due" query with the Admin Assistant's
    list_leads_due_for_follow_up tool and the leads page's filter (all
    three used to independently full-table-scan in memory); the Assistant
    gained propose_create_lead; the leads page has real server-side
    filters and note-taking that preserves history in the activity log;
    assignment rules can be explicitly applied to existing unassigned leads.
  Live Learning Operations — L1 foundation in progress (`Coding Docs/
    14_Live_Learning_Operations.md`). Existing batch-level Zoom personal
    links and attendance sync remain live and unchanged throughout. Built:
    schema/RLS (live_sessions, live_session_audit_log,
    live_session_registrants, plus schema-only live_session_reminders/
    live_session_attendance for later), status workflow including admin
    Cancel/Reschedule with a mandatory reason, the staff scheduling Control
    Centre, the tutor read model on My Courses, and a student portal "Next
    Class" card (Confirmed+Paid eligibility, a join-window gate — 15
    minutes before start through session end, a placeholder default still
    pending founder confirmation). Migrations `202607250025/026/027` not
    yet applied to production; batch schedule generator and session-level
    Zoom adapter remain pending — see PLAN.md's Live Learning Operations
    section for the full L1–L5 roadmap and open founder decisions.
  Student portal credential repair - deployed 2026-07-25: missing portal
    authentication rows are backfilled and normal login self-heals an absent
    row from the participant phone without replacing an existing PIN.

  Corporate Registration, Portal, and Dashboard (2026-07-26, all 4 phases
    shipped) — see `Coding Docs/15_Corporate_Operations.md`. A Company buys
    a Seat Allocation (N seats in one Batch, invoice/bank-transfer billing);
    staff (or the company's own portal session) add named employees up to
    the purchased quota, each becoming a normal Registration (certificates/
    attendance/individual portal all work unmodified). Capacity is reserved
    the moment seats are sold via a new silent
    coursesService.adjustBatchCapacityInternal nudge, then released one seat
    at a time as employees fill in (net-zero change in public availability)
    or fully released on cancellation (which does go through the real
    updateBatch, so the existing waitlist-notify fires correctly). No
    invoice table — amountInvoiced/amountSettled/seatsUsed are always
    computed live from the linked registrations/payments rows. The company
    admin portal (`/company-portal`) reuses the participant portal's exact
    PIN + session-cookie pattern (`modules/portal` was the template),
    scoped to `company_id`; it can never mark a payment Paid (BR-12 — no
    staff identity exists for that write). Staff screens live at
    `/corporate`; the dashboard gained a Corporate summary card. Migration
    `202607260032_corporate_registration.sql` — pending production
    application (run `npx supabase db push` when ready).

  Student portal gap-closing (2026-07-26) — closed five best-practice gaps
    identified in an audit: on-demand payment receipt PDF (lib/portal/
    receipt-pdf.ts, same generated-never-stored pattern as invoices/
    certificates); a per-registration message history section reusing the
    email/whatsapp/sms log tables via a new ungated
    communicationsService.getMessageLogForRegistrations; an "Explore other
    courses" section reusing coursesService.getActiveBatchesForPublicForm;
    a support-contact footer; and self-service PIN recovery
    (/portal/forgot-pin → email → /portal/reset-pin) via a third opaque
    single-use token table, participant_pin_reset_tokens (migration
    202607260033, same RLS-enabled-zero-policies posture as
    portal_login_tokens) — resetting also clears any lockout, so it is
    also the only self-service recovery path for a locked-out account.
    Migration 202607260033 pending production application (run
    `npx supabase db push` when ready).

  Registration 360° view — "View" action on the Registrations list
    opens a detail dialog aggregating payment, every message channel,
    Zoom, attendance, feedback, certificates, and calls for one
    Registration; role-shaped per Document 5 Section 3 (Admin sees all,
    Finance sees payment audit + Calls, Marketing sees Payment Status
    only) — sections omitted from the API response entirely when the
    role can't see them, not just hidden client-side.
    `GET /api/registrations/[id]`.

  Tutor Portal (2026-07-27, both phases shipped) — tutors are external
    parties, not Knowsia staff; retires the earlier staff-role Tutor
    experience (`/my-courses`, a bare roster page with no working Zoom
    join link and zero attendance/certificate visibility) in favor of a
    third non-staff portal tier, identical architecture to the
    participant and company portals (PIN + session cookie, RLS enabled
    with zero policies, service-layer authorization). New `modules/tutors`
    owns both the staff-facing `/tutors` management screen (create/edit
    tutors, batch counts) and the tutor portal's auth/dashboard reads —
    same one-module-per-domain precedent as `modules/corporate`. The
    Courses and Live Sessions screens' facilitator/tutor picker now draws
    from `tutors` instead of staff accounts (additive
    `batches.facilitator_tutor_id` / `live_sessions.tutor_id` columns;
    the legacy `facilitator_staff_id` / `tutor_staff_id` FKs are left in
    place but no longer written to). `'tutor'` is fully removed from
    `StaffRole`, the `staff_users.role` CHECK constraint, and every
    role allow-list. Tutor portal dashboard: Overview, My Schedule (with
    a working Zoom join link — the gap the old page had), Roster,
    Attendance (read-only), Certificate Eligibility (read-only), Account.
    See `Coding Docs/16_Tutor_Operations.md` and BR-31 through BR-34.
    Migration `202607270034_tutor_portal.sql` pending production
    application (run `npx supabase db push` when ready) — includes a
    pre-check: if any `staff_users` row still has `role = 'tutor'`, the
    CHECK-constraint drop fails loudly rather than silently corrupting
    data; confirmed no such row exists in any committed seed/migration.

  Tutor Portal Phase 4 (2026-07-31, foundation shipped) — a follow-up
    review of tutor access against best practice. Built: a tutor action
    audit log (`tutor_action_audit_log`, closes a real gap — PIN changes
    and contact edits were previously unlogged), Attendance Exceptions
    (`attendance_exceptions` — tutor-raised no-show flags/correction
    requests, always admin-reviewed on /attendance before anything
    changes; BR-34 unchanged, a tutor never writes to `attendance`
    directly), Session Materials (`session_materials` — tutor-shared
    material links per batch, link-based like `batches.resources_link`
    rather than file storage; visible on /live-sessions and the student
    portal's new Materials tab), and a registered-student count on the
    tutor's batch selector (not a payment field). Also fixed a latent bug:
    the tutor-portal Attendance panel was silently returning empty
    results because the underlying read used the staff-RLS client, which
    returns zero rows for a caller with no Supabase Auth session — added
    a service-role read path matching every other tutor-portal read.
    Explicitly declined for now: tutor visibility into participant
    payment amounts (requested mid-build; reverses BR-33, scope
    undecided — see Coding Docs/16_Tutor_Operations.md §11, do not build
    without founder sign-off on aggregate-vs-per-student scope). Deferred
    to a later phase: recording release, learner follow-up notes,
    substitute handover, availability/blackout dates, tutor→roster
    messaging (suspended), tutor compensation tracking (shape decided —
    full rate-based — but deferred, no payable-session rule exists yet).
    Migrations `202607290037/038/039` pending production application (run
    `npx supabase db push` when ready).

Open decisions (founder):
  - AI05 ("...Reporting and Modeling") vs AI02 ("...Reporting and
    Analysis") are near-duplicate courses — pick a canonical one.
  - Exposed legacy Supabase service_role key still needs rotation.
  - .env holds Paystack LIVE keys; Week 2 gate wants a TEST-mode
    end-to-end run first — get test keys or accept a deliberate small
    live charge (Doc 4 EC-07…EC-10).

Still open from the original Week 4/5 checklist: Sentry DSN live-fired,
Uptime Robot monitor, remaining staff accounts, live RLS pass for
Tutor, load test, manual pre-launch checklist, final go-live.

Feature backlog (lower priority, not yet built): session-days schedule
(superseded in part by the Live Learning Operations LiveSession model),
dashboard attendance/feedback/certificate metrics.

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

*Full documentation suite: `Coding Docs/01_PRD.md` through `Coding Docs/16_Tutor_Operations.md`.*
*Live task tracker: `PLAN.md`.*
