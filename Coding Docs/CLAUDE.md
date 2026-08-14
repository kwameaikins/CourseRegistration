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

This is primarily an internal operations tool for one business — not an LMS, not
multi-tenant. See `/docs/01_PRD.md`, Section 9 ("Out of Scope") before adding any feature
not already specified.

**There is a second Knowsia codebase.** `KnowsiaApp` (`github.com/kwameaikins/KnowsiaApp`, a
separate repo in a sibling directory) is the AI exam-prep platform — question bank, AI tutor,
self-paced LMS, subscriptions. The boundary between the two was settled 2026-08-13 and is
**binding**: *people and money here; learning content and AI there; neither rebuilds the other's
half.* Read `Coding Docs/19_Platform_Convergence.md` §3 before building anything that sounds like
studying, questions, or AI tutoring — the answer is almost certainly that it already exists and
belongs over there. One deliberate exception as of 2026-08-02: **Knowsia Insights**
(`/news/**`) is a genuinely public-facing news/content product, not an internal tool — see
`Coding Docs/17_News_Insights_Operations.md`.

---

## Before you write any code

Read the relevant document(s) below. Do not implement a feature from memory of a prior
conversation — re-read the spec every time, because it is the authoritative source, not
your summary of it.

| Task | Read first |
|---|---|
| Any new feature or screen | `/docs/01_PRD.md` — find the Feature ID (F1.xx) if one exists, else check for a trailing "Extension" section pointing at a companion doc (the convention used for every major feature added since the original PRD — Revenue OS, Live Learning Operations, Corporate Registration) |
| **Anything that might already exist in KnowsiaApp** — question bank, mock exams, AI tutor/explanations, self-paced LMS/video, spaced repetition, study plans, essay marking, subscriptions | `Coding Docs/19_Platform_Convergence.md` §3 — **read before building any of these here.** They belong to the other system and must not be rebuilt in this repo |
| Live sessions, Zoom delivery, attendance review, recordings, tutor/student learning workflows | Coding Docs/14_Live_Learning_Operations.md |
| Self-hosted WebRTC classroom ("Knowsia Live"), replacing Zoom as the live provider | `Coding Docs/18_Knowsia_Live_RTC.md` — **decision is "do not build now" (2026-08-13)**; read §1 before acting on `Coding Docs/knowsia-live-mediasoup-engineering-plan.md`, which is the founder's original analysis and is superseded in part (§3 lists every deviation, including LiveKit over mediasoup) |
| Corporate registration, seat allocations, company portal | Coding Docs/15_Corporate_Operations.md |
| Tutor portal, tutor management, facilitator assignment | Coding Docs/16_Tutor_Operations.md |
| Database, schema, migrations | `/docs/03_Data_Schema_and_ERD.md` — full SQL, triggers, RLS |
| Business logic, validation, edge cases | `/docs/04_Business_Logic_Rules.md` — BR-01 through BR-30 |
| API routes | `/docs/05_API_Contract.md` — exact request/response shapes |
| Auth, RLS, secrets | `/docs/06_Security_and_Authentication.md` |
| Paystack, Resend, Supabase, Sentry, Uptime Robot | `/docs/07_Integration_Specifications.md` |
| UI screens, components, signifiers | `/docs/08_UIUX_Screen_Specification.md` |
| Writing or running tests | `/docs/09_Test_Specification.md` |
| Affiliate/partner marketing, coupon codes, commissions/payouts | `Coding Docs/knowsia_growth_partner_programme.md` — the founder strategy doc driving this feature |
| Knowsia Insights (AI news pipeline, Editorial Dashboard, public news site) | `Coding Docs/17_News_Insights_Operations.md` — read this before touching `modules/news-insights`; also read the deviations list (§2) before assuming `Coding Docs/Knowsia_Insights_Agentic_News_Refined.md` (the original founder spec) is current |
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
- **Knowsia Insights news pipeline:** same Anthropic Claude API / `ANTHROPIC_API_KEY`, but continuous (not bounded pay-per-use like the assistant) — founder-approved 2026-08-02 as its own accepted budget exception given the different cost shape. See `Coding Docs/17_News_Insights_Operations.md` §7 for the (currently zero, since no source is configured) real cost.
- **Voice calls:** Vapi (approved 2026-07-19; ~$0.05–0.15/min, targeted triggers only — accepted budget exception)
- **Payments:** Paystack (Card + MTN MoMo)
- **File storage:** Cloudflare R2 (founder-directed 2026-08-02, payment slip uploads only; free tier at this scale) — accessed via `lib/r2/client.ts` using `aws4fetch`, not the AWS SDK
- **UI:** Shadcn/ui + Tailwind CSS (components copied in via CLI, not npm-installed)
- **Hosting:** Vercel (including Vercel Cron for scheduled jobs)
- **Monitoring:** Uptime Robot (uptime) + Sentry (errors)
- **Budget constraint: $0/month — for THIS repo.** Do not introduce any paid service without
  asking first. Every approved exception so far (Arkesel, Vapi, Anthropic) is small and metered.
  KnowsiaApp runs its own already-accepted infrastructure budget (Railway, Supabase Pro, Upstash,
  Cloudflare Stream, PostHog); that is not licence to spend here, and neither repo may commit the
  other to spend. See `Coding Docs/19_Platform_Convergence.md` §6. A self-hosted
  WebRTC classroom would not be — ~EUR 50-150/month on bare metal, four figures *per session* on
  any metered-egress host (~570 GB egress for one 500-person 3-hour class). No exception has been
  approved and none is needed: the decision is not to build it. See `Coding Docs/18_Knowsia_Live_RTC.md` §6.

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
    Class" card (Confirmed+Paid eligibility; join-window gate settled
    2026-08-11 — no pre-start restriction, the link is live for the whole
    of the soonest session that has not ended and disappears 60 minutes
    after its scheduled end). Migrations `202607250025/026/027` not
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
    `202607260032_corporate_registration.sql` — applied to production and
    verified present in `supabase migration list` 2026-08-12.

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
    Migration 202607260033 applied to production and verified present in
    `supabase migration list` 2026-08-12.

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
    Migration `202607270034_tutor_portal.sql` applied to production and
    verified present in `supabase migration list` 2026-08-12 — includes a
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
    Migrations `202607290037/038/039` applied to production and verified
    present in `supabase migration list` 2026-08-12.

  Registrant messaging for the Admin Assistant (2026-08-01) — closed a gap
    where the assistant could message leads one-off and in bulk but had no
    equivalent for registrations. Added `search_registrations` (read),
    `propose_send_sms_to_registration`/`propose_send_email_to_registration`
    (mirrors the existing lead versions exactly, including not being logged
    to email_log/sms_log), and `propose_call_registration` — a new
    capability with no lead equivalent, triggering a real Vapi outbound
    call (`call_log.call_type = 'ad_hoc'`) that reads a staff-composed
    message. `propose_create_campaign` gained `audienceType: 'leads' |
    'registrations'` so a campaign can target a filtered slice of
    registrations (batch/course/payment status) instead of leads;
    `campaign_members.lead_id` is now nullable alongside a new nullable
    `registration_id` (CHECK: exactly one set). The `ad_hoc` call type
    requires a manual prompt addition to the Vapi outbound assistant's
    dashboard config (not deployable via code) — see `Coding Docs/
    07_Integration_Specifications.md` §11.3 for the exact text; until then
    ad-hoc calls dial but the assistant won't know what to say. Migrations
    `202607290040/041` applied to production and verified present in
    `supabase migration list` 2026-08-12.

  Class reminders, upsell/cross-sell, and WhatsApp group invitation
    (2026-08-01) — closed a real production gap: class_reminder_24h/2h,
    upsell, and whatsapp_invite existed as EmailType slots on the Messaging
    screen but had no template content and no trigger, ever ("Not written
    yet — this email is skipped" for all four). Only the voice-call upsell
    was real. Now wired across email/SMS/WhatsApp: class reminders via new
    modules/communications/class-reminder-scheduler.ts (24h is date-level,
    fine for the daily cron; 2h needs a new free external scheduler — GitHub
    Actions hitting a new /api/cron/class-reminders-frequent route every 15
    min, since Vercel Hobby's 2 cron-job slots are both already used and only
    fire once/day); upsell via new modules/communications/upsell-scheduler.ts,
    reusing the voice call's exact feedback-interest-matches-an-open-batch
    logic (same "one pitch ever per registrant" limitation the voice call
    already had, not new); whatsapp_invite via runPaidTransitionSideEffects
    (fires once, alongside payment_confirmation). Default template copy is a
    founder-requested draft, backfilled onto all 13 existing courses — needs
    review/editing on the Messaging screen before considered final. Migration
    `202608010042` applied to production 2026-08-02. WhatsApp sends for all 4
    stay dormant until 4 new Meta Business Manager templates are created and
    approved (names/params documented in the migration header). The GitHub
    Actions workflow needs a `CRON_SECRET` repository secret added manually
    before its schedule will actually run.

  Self-service payment submission + staff approval (2026-08-02) — closed a
    real gap: MoMo/bank-transfer payers had to email a transaction reference
    and wait for manual reconciliation. Added a portal submission form
    (amount/method/reference/date + optional slip upload) queuing into a new
    finance/admin "Payment Submissions" view on the existing Payments
    screen. Approving a submission doesn't reinvent payment-writing logic —
    it calls the existing applyPaymentUpdate, so BR-04/05/06/12 all keep
    working unchanged; the amount added is additive to the existing
    amount_paid, never a replacement. First file-upload capability in this
    codebase: slips live in Cloudflare R2 (not Supabase Storage, founder
    directive), via lib/r2/client.ts (aws4fetch, not the AWS SDK) — gated
    off until R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/
    R2_BUCKET_NAME are set (confirmed set in .env as of 2026-08-02).
    Migration 202608010043 applied to production 2026-08-02.

  Knowsia Growth Partner Programme (2026-08-02) — affiliate/partner
    marketing + coupon codes, per `Coding Docs/knowsia_growth_partner_
    programme.md`. All 4 partner categories built now: Ambassador (tiered
    %: 12/15/18 at 10/30 paid enrolments this month), Tutor Partner (flat
    10% of first payment — renewal commissions deferred, no subscription
    product exists), Institutional Partner (tiered flat fee: GHS30/40/50 at
    50/200 paid enrolments this year), Strategic Partner (manually
    negotiated rate, or no automatic commission at all if none is set).
    One `codes` table serves both coupon-discount and partner-attribution
    duty. Commission pipeline is `Tracked -> Pending -> Approved -> Payable
    -> Paid`; Tracked is a derived state (a `code_redemptions` row exists
    with no `partner_commissions` row yet) — a commission is only ever
    created once a payment actually clears
    (`partnersService.accrueCommissionOnPaymentSystem`, hooked into the
    existing `runPaidTransitionSideEffects`), computed on the amount
    actually paid, never the listed course fee. `qualifies_at =
    GREATEST(payment date + 14 days, the batch's start date)`; the existing
    07:00 cron flips `pending -> approved` once that date passes. Anti-
    fraud: no commission when the registrant was already an existing lead,
    and none for a self-referral (partner's own email/phone) — the
    student's discount still applies either way. Attribution priority is
    an explicitly typed code, then a 30-day `knowsia_ref_code` cookie set
    by the new `/r/[code]` tracked-link redirect (QR codes reuse the exact
    `QRCode.toDataURL` call already in `lib/certificates/pdf.ts`). Public
    surfaces: `/partners/apply` (Ambassador/Institutional only — Tutor/
    Strategic are always staff-created) and a coupon field on `/register`
    with a live discount preview; best-price-wins against the early-bird
    discount (never stacked). Non-tutor partners get a new standalone
    portal (`/partner-portal`, PIN + session cookie, mirrors
    `modules/corporate` exactly); a Tutor Partner instead gets a new
    "Referrals" panel inside their *existing* tutor portal login — no
    second account. Staff console at `/partners` (Applications / Partners /
    Codes / Commissions & Payouts), admin+marketing for the first three,
    finance+admin for the last. Explicitly deferred (the doc's own "Scale"
    phase, not "Foundation"): performance bonuses, the marketing/campaign
    content library, the partner leaderboard, and the fuller fraud/
    analytics suite (duplicate-account detection, refund-rate dashboards).
    Migration `202608020044_partners_and_codes.sql` applied to production
    2026-08-02.

  Existing-tutor/student self-serve referrals + commission-as-course-credit
    redemption (2026-08-02, same-day follow-up) — closed three gaps founder-
    flagged right after the Partner Programme shipped. (1) Existing tutors
    now auto-provision a partner record + one referral code the first time
    they view their portal's Referrals panel (`ensurePartnerForTutorSystem`),
    instead of needing a staff member to manually link one first — matches
    the doc's own stated intent that every tutor automatically has affiliate
    capability. An admin "Backfill Tutor Partners" button on `/partners`
    (Partners tab) provisions the whole existing roster in one click rather
    than waiting for each tutor to log in. (2) An existing student can now
    self-serve "Refer & Earn" from a new panel in their own student portal —
    becomes an Ambassador partner instantly, no application, no staff
    review (distinct from the public form's manual-approval path). (3)
    Commission-as-course-credit redemption — a partner (tutor, self-served
    student-ambassador, or a partner-portal partner) can spend their own
    `payable` commission balance to reduce a course fee instead of waiting
    for a cash payout: toward their own registration (a dropdown in the
    student portal) or a referred student's (resolved server-side from an
    email, since a partner won't know a raw registration id). `partners`
    gained a nullable `participant_id` (mirrors `tutor_id` — links a self-
    served Ambassador to their own student record); `partner_commissions`
    gained a `redeemed` status (a terminal state alongside `paid`) and
    `redeemed_against_registration_id`. The fee mutation itself reuses
    `applyDiscount`'s exact course_fee/original_fee/discount_amount math,
    just system-originated (`redeemCommissionCreditSystem` in
    `modules/payments/service.ts`, which calls into `modules/partners` for
    ownership validation and bookkeeping — payments owns the fee write,
    partners owns the commission ledger, same split as the existing accrual/
    payout flow). Migration `202608020045_partner_credit_redemption.sql`
    applied to production 2026-08-02.

  Course-specific referral links & QR codes (2026-08-02, same-day follow-up) — closed the gap where
    the tutor and student portals had no shareable link/QR at all (only the standalone partner
    portal did), and no link could target a specific course. `app/r/[code]/route.ts` now forwards an
    optional `?batchId=` straight through to `/register?ref=...&batchId=...`, which already
    pre-selects that batch on mount (built earlier for the waitlist "a seat opened up" email —
    `RegistrationForm.tsx`). `buildReferralUrl`/`generateReferralQrDataUrl`
    (`modules/partners/service.ts`) take an optional `batchId`; a bad/expired/unknown one just fails
    the existing `batchOptions.some(...)` check and falls back to "Select a course" — no new error
    handling needed. New public `GET /api/register/active-batches` (unauthenticated, same data
    `/register` already renders) feeds a course-picker dropdown now added to all three referrer
    portals (student "Refer & Earn", tutor "Referrals", and the existing partner portal's Codes
    panel), each per-code with a reactive link, a "Copy link" button (new — first
    `navigator.clipboard` usage in the codebase), and "Show QR code". New ownership-checked QR
    endpoints `GET /api/tutor-portal/qr-code` and `GET /api/portal/qr-code` mirror the existing
    `/api/partner-portal/qr-code` exactly, reusing each portal's existing `getReferralSummaryForSession`
    for the ownership check — no new service-layer functions needed. No schema change — the batch id
    is a transient query-string hint, never persisted, and plays no role in attribution or commission.

  Knowsia Insights (2026-08-02, Phase 1 shipped) — new `modules/news-insights` module: an
    8-agent-minus-1 pipeline (source collection, triage/dedup, research & drafting,
    independent verification, editorial risk routing, publishing, monitoring —
    personalisation deferred to Phase 2) producing original news/analysis for accountants/
    auditors/finance professionals across all 7 canonical categories (founder chose the full
    set over the source doc's proposed 3-category beachhead). `pipeline_jobs.stage` is the
    status-column backbone (doc's own recommendation, already this codebase's pattern);
    `GET /api/cron/news-pipeline-advance` advances one bounded batch per stage, polled every
    15 minutes by `.github/workflows/news-pipeline-advance.yml` (Vercel Hobby's 2 cron slots
    are both already used, same external-scheduler workaround as class-reminders-frequent).
    Every agent call is a forced structured tool call (never open-ended generation, the
    doc's prompt-injection mitigation) and logs to `agent_run_log`
    (`GET /api/news-pipeline/cost-summary` — real cost from day one). Verification is a
    genuinely independent pass: it never receives the drafting agent's own reasoning, only
    the draft's final text plus original sources, and unverified content is hard-blocked in
    code from ever reaching Level 1 auto-publish regardless of the risk model's own read.
    Staff Editorial Dashboard at `/editorial` (admin+marketing: Review Queue, Pipeline,
    Sources, Cost); public site at `/news`, `/news/[category]`, `/news/article/[slug]`
    (the first genuinely public-facing product surface in this codebase, not just a public
    form). Three deliberate deviations from the source doc — no pgvector/embeddings (no
    provider configured; dedup uses content_hash + pg_trgm fuzzy title matching instead),
    no pre-seeded sources (fabricating source URLs isn't something to do — add real ones via
    the Sources tab), and no Level 3 override UI yet. Retention (30-day raw-text purge) and
    the Level 2 review SLA (4 business hours) are unconfirmed placeholders per the source
    doc's own Section 12. Full details, all deviations, and required setup steps in
    `Coding Docs/17_News_Insights_Operations.md`. Migrations
    `202608020046_news_insights.sql` and `202608030047_news_relevance_filter.sql` both
    applied to production 2026-08-03. The 11 new tables in
    `lib/supabase/database.types.ts` were hand-written, then verified field-by-field
    against `npx supabase gen types typescript --linked` output — they match. Do NOT
    wholesale-replace that file with generated output: the current generated types
    declare `fn_delete_registration_immediately`/`fn_delete_participant_immediately`
    with a non-nullable `reason`, which breaks `modules/registrations/repository.ts`
    (it passes `string | null`). Pre-existing, unrelated to this module, still open.

  Knowsia Insights hardening from the first real run (2026-08-03) — four bugs that only
    surfaced against live sources, all found by running the pipeline rather than by
    typecheck. (1) The collector truncated to the first 15k chars of *raw HTML*, which for
    icagh.org is 15k of WordPress CSS variables (383k-char page) and for ifac.org yields
    386 characters of nav labels — both sources returned zero news while still paying for a
    model call. It now reduces to readable text first (anchors rewritten to "text (url)" so
    article links survive), which brings both pages to ~5.4k chars that fit entirely. This
    single fix is what made ICAG produce real Ghana content. (2) Model-reported dates like
    "June 2026" are rejected by a timestamptz; the throw aborted the item loop and discarded
    every remaining item *after* the model call was already paid for — dates are now
    normalized and each item is isolated. (3) Supabase errors aren't `Error` instances, so
    `String(err)` wrote "[object Object]" into `news_sources.last_fetch_error`, destroying
    the diagnostics the Sources tab exists to show. (4) A triage tag outside the hardcoded
    enum threw from `.parse()` and 500'd the entire cron run; only `category` is strict now
    (it's a DB CHECK), cosmetic tags are filtered, and every stage wraps each job in
    `runJobSafely` (3 attempts, then the `error` stage) so one bad item can never take down
    a tick. Note for future work: zod `.transform()`/`.catch()` cannot be used in any schema
    passed to `callStructuredAgent` — `z.toJSONSchema()` throws outright on transforms.

  Knowsia Insights relevance gate (2026-08-03, founder-approved) — the Triage Agent now also
    scores each story 0-100 for relevance to a Ghana-based accounting/finance audience
    (Ghana/Africa-first bands in its system prompt) and anything below
    `RELEVANCE_THRESHOLD` (40, in `modules/news-insights/pipeline/triage.ts`) stops at the
    new terminal `filtered` stage instead of reaching drafting/verification — the two
    mid-tier agents that measured 81% of all spend at ~$0.045/story. The scoring adds no
    extra API call (extra fields on the existing triage call), and every decision is
    recorded in `agent_run_log.output_summary` so the threshold can be tuned against real
    numbers from the Pipeline tab. Honest caveat: measured filter rate was only ~7% (1 of
    14), far below the 40-50% estimated — the off-topic content problem was mostly the
    broken collector above, not a filtering problem, so this saves less than expected.
    Real measured cost is ~$0.05/story, i.e. roughly $25-38/month at the source doc's
    assumed 15-25 stories/day. NOT YET BUILT and worth revisiting: a daily story/spend cap.
    Nothing currently bounds volume — `BATCH_SIZE_PER_STAGE` is 8 and the workflow fires
    every 15 minutes, so the theoretical ceiling is ~768 drafts/day (~$600/month) if source
    volume ever rises. Founder declined the cap on 2026-08-03 when the gate was expected to
    do more work; the measured shortfall makes it more relevant, not less.

  Learning resource uploads + student assignment submissions (2026-08-04) —
    founder request: "tutors or admin should be able to upload learning
    resources and students able to submit assignments." Two parts.
    (1) session_materials gained real file uploads (file_path/file_name/
    file_size_bytes/content_type + uploaded_by_staff_id). A material is now
    either a link or an R2-backed file, never both — enforced by
    chk_session_materials_link_xor_file, with SessionMaterial.kind as the UI
    discriminator; existing link rows are untouched and still valid. This
    completes what Document 14 §4/§6 always specified ("Tutor ... upload
    materials"); the earlier link-only shape was a shortcut taken before any
    file storage existed, and Cloudflare R2 landed 2026-08-02. Admin can now
    author/delete materials on any batch from /live-sessions; management
    still reads only. (2) NEW SCOPE, flagged per rule 10: `assignments` +
    `assignment_submissions`. PRD §9 lists content delivery as out of scope
    ("not an LMS") and Document 14 §6 gave students no submit capability —
    built anyway on explicit founder instruction, deliberately in the
    existing "submitter-raised row, reviewer acts on it" shape
    (attendance_exceptions/payment_submissions), NOT as a gradebook: one
    current submission per Registration per Assignment (a resubmission
    overwrites in place AND clears any grade given against the file it
    replaced), optional 0-100 grade + feedback, no version history, and no
    link to certificates/attendance/payment. New `modules/assignments` owns
    it rather than modules/live-sessions, because Document 14 §3 forbids
    live-sessions from changing grades. Neither new table has a tutor- or
    participant-facing RLS policy (no portal session is a Supabase Auth
    session, BR-31) — the service layer is the boundary: requireOwnBatch /
    a new requireOwnAssignment for tutors, and for students BOTH "the
    registration is this session's" AND "the assignment/material belongs to
    that registration's own batch" (checking only the former would let a
    learner submit against another cohort's assignment). Marking is
    tutor-only by design — staff see counts, not individual work; see
    Document 16 Phase 5 for why, and for the deferred list. Uploads are
    capped at 20MB, but Vercel Hobby's 4.5MB request-body cap binds first —
    revisit with direct-to-R2 presigned uploads if large decks are needed.
    R2 objects are intentionally not deleted when a row is. Migration
    `202608040049_learning_resources_and_assignments.sql` applied to
    production 2026-08-05 and verified against the remote database (both new
    tables present with every column, session_materials carrying all five new
    columns, and anon blocked by RLS on all three). Storage: all three upload
    types share ONE R2 bucket, `knowsia-course-bucket` (founder confirmed
    2026-08-05: one bucket, no new ones — a new upload type gets a new key
    prefix instead). Note `.env.local.example` long carried a stale
    `payment-slips` placeholder from when slips were the only upload; that is
    a placeholder, not the real bucket. The KEY is what organises the bucket,
    and every key is built by `lib/r2/keys.ts` and nowhere else:
      slips/<registrationId>/<uuid>.<ext>
      materials/<batchId>/<uuid>.<ext>
      submissions/<assignmentId>/<registrationId>/<uuid>.<ext>
    i.e. <content type>/<owning aggregate>[/<sub-scope>]/<random uuid>.<ext> —
    so each type can be listed/lifecycle-ruled alone, and everything belonging
    to one registration/batch/assignment is a single prefix listing (what a DPA
    erasure or batch cleanup needs). Filenames are always fresh UUIDs, never
    the uploader's (untrusted; the display name lives in the DB), and the
    extension comes from the validated MIME type. All three prefixes were
    normalised 2026-08-05 while the bucket was still empty — payment slips
    previously sat at the bucket ROOT as `<registrationId>/...`, which is why
    this was free; treat the prefixes as fixed now, since changing one orphans
    existing objects (the DB stores whole keys, so old rows still resolve).
    Covered by `tests/unit/r2-keys.test.ts`. Also fixed one pre-existing
    unrelated red test (tutors-service "getReferralSummaryForSession
    delegates to partnersService" — its mock was never updated when the
    2026-08-02 auto-provisioning guard landed, so it had been failing since).

  Attendance sync never recorded anything (2026-08-06) — founder asked for an
    attendance assessment of two delivered sessions (IA02 "Global Internal Audit
    Standards" 2026-07-25, ESG2 "Understanding ESG" 2026-08-06). Neither had
    attendance. Investigation found `attendance` and `zoom_registrants` EMPTY
    account-wide — the feature had never written a row since shipping
    2026-07-19. Three independent causes, all now fixed:
    (1) The Server-to-Server OAuth app was never granted
    `report:read:list_meeting_participants:admin`, so every
    getPastMeetingParticipants call failed 400/4711. The error landed in
    runAttendanceSync's per-batch `summary.errors` and the cron still returned
    200, so nothing ever surfaced. `lib/zoom/client.ts` now treats a 4711 as
    "try the next source" and falls back to the Dashboard API
    (`/metrics/meetings/{uuid}/participants`), whose scope the app already
    holds — so the sync works today without waiting on a Zoom console change,
    and upgrades itself automatically if the report scope is later granted.
    (2) A numeric meeting ID resolves to the LATEST instance only. These classes
    open the room several times a day (host setup, test run, post-class
    reconnects), so the sync was reading a one-person reconnect instead of the
    class — on 2026-08-06 that was 1 participant instead of 286. New
    `listMeetingInstancesOn`/`getMeetingParticipantsOn` enumerate every sitting
    on the date (past-instances endpoint, else account cloud-recordings, else
    the bare numeric id) and aggregate across them.
    (3) Matching was email-only, but nobody was ever registered with Zoom
    (`zoom_registrants` empty), so participants joined on a SHARED link and Zoom
    reports a self-typed display name with no email — 1 of 286 ESG attendees and
    1 of 12 IA02 attendees carried one. Match order is now registrant id →
    registered email → display name. Name matching is deliberately strict (2+
    shared tokens after stripping honorifics, AND exactly one roster candidate)
    because on a free Batch an attendance row is what makes a certificate
    issuable; single-token and ambiguous names stay unmatched for staff to
    adjudicate rather than being guessed into the record. A looser tier
    (`minSharedTokens: 1` — one shared token of 4+ characters, still requiring
    exactly one roster candidate) is available on the BACKFILL only, never the
    nightly sync: founder-approved 2026-08-06 for ESG2, where strict matching
    reached 90 of 267 registrants and the alternative was 177 people with no
    route to a certificate. The tradeoff was stated and accepted — some of
    those rows are wrong, and they feed a certificate gate. The ambiguity rule
    (two equally plausible candidates ⇒ no match) is absolute at BOTH levels;
    only the token threshold moves. Inferred rows are
    written as `source = 'zoom_name_match'` (migration `202608060050`) so a
    roster shows exactly how each row was established.
    Also: the cron now reports a non-empty `summary.errors` to Sentry instead of
    a silent 200, and `POST /api/cron/attendance/backfill` (CRON_SECRET-gated,
    dry-run by DEFAULT, deliberately not in vercel.json's cron list) recovers a
    Batch whose window has closed — selectBatchesForAttendanceSync only ever
    looks at batches still in progress, which had made past sessions
    permanently unrecoverable.
    Downstream impact of the outage: ESG2 is a FREE batch, and
    isCertificateEligible swaps the payment gate for `attendedSessions > 0` on
    free batches — so all 267 ESG registrants were ineligible for certificates
    until this was backfilled. IA02 is paid and was unaffected.

  Attendance rate threshold (2026-08-06) — founder: "at least 40% meeting
    session rate", revised the same day to 30%. Certificate eligibility on a
    free Batch tested `attendedSessions > 0`, i.e. row EXISTENCE, so a
    two-minute appearance on a 175-minute session earned the same credit as the
    whole session (the ESG2 backfill produced 11 rows under 15 minutes, one of
    them 0). attendedSessions now counts only rows clearing
    `MIN_ATTENDANCE_RATIO` (0.3) of the session. The ratio is applied at READ
    time and never baked into a stored row, so changing it re-scores all
    existing attendance on the next read — no migration, no backfill.
    The rule needed a denominator that did not exist: duration_minutes is the
    PARTICIPANT's time and batches has start_time but no end_time, so migration
    `202608060051` adds `attendance.session_minutes`, written by the sync as the
    LONGEST SINGLE SITTING that day — not first-join-to-last-leave, which on
    2026-08-06 would have been ~14 hours (morning host check + class +
    post-class reconnect) against a real class of 175 minutes.
    Threshold + percentage live in `lib/attendance-constants.ts`, shared by the
    sync and certificates so they can never drift.
    Two deliberate exemptions: (a) rows with a null session_minutes (written
    before the denominator existed) count as attended rather than being
    retroactively failed; (b) `source = 'manual_correction'` is never
    re-judged — it carries duration_minutes: 1 as a MARKER, not a measurement,
    so thresholding it would have silently overturned every admin-approved
    attendance correction. That was a live regression introduced by this change
    and caught before it shipped.
    Effect on the backfilled data at 30%: IA02 369-min session, threshold 111
    min, all 8 rows pass. ESG2 175-min session, threshold 53 min, 82 of 119 pass
    and 37 fall below (at 40% it was 76/43).
    Attendance rows are KEPT either way — they are real observations,
    still shown on the Attendance screen with attendanceRatePercent and
    meetsThreshold so staff can see why someone counts as absent.

  Feedback request targets attendees on a free Batch (2026-08-06) — founder:
    "send the feedback notice to all attended participants."
    `runFeedbackRequestDispatch` targeted PAID registrations of batches that
    ended yesterday. On a free Batch every registration auto-settles to Paid
    (202608030048), so that would have mailed all 267 ESG2 registrants at 07:00
    the next morning — and the post_training_thankyou template promises "your
    certificate of participation will be sent to you once your feedback is
    received", which after the attendance-rate rule the system cannot honour
    for the 185 who did not attend.
    The dispatch now mirrors `isCertificateEligible` exactly: free Batch →
    attendees (`selectAttendedRegistrationIdsForBatch`), paid Batch → Paid
    registrations, unchanged. Deliberately NOT attendance-gated on paid
    batches: attendance can legitimately be empty there (the Zoom sync only
    began writing rows 2026-08-06) and a paid participant earns a certificate
    whether or not the sync saw them — gating it would lose real feedback for
    no benefit.
    `POST /api/cron/feedback/attendees` (CRON_SECRET-gated, dry-run by DEFAULT,
    not in vercel.json) is the manual trigger for a Batch whose window has
    already passed. Sent 2026-08-06: IA02 1 new + 7 already-mailed skips
    (email_log dedup), ESG2 82 — 91 delivered, 0 failures.

  Payments screen hid 27 of 35 outstanding balances (2026-08-06) — founder:
    "only 8 shows at the payment but we have about 35 unpaid." Not a payment
    bug; a paging bug. The screen loaded `/api/registrations?limit=200`
    (page 1, `registered_at` DESC) and applied the outstanding filter in
    `visibleRows` CLIENT-side. Payment status lives on `payments`, which the
    list read joins AFTER slicing the page, so the filter could only ever
    filter rows that survived the slice. The 267 free ESG2 sign-ups on
    2026-08-04 — all auto-Paid at GHS 0 — filled the entire 200-row window and
    pushed everything registered before 2026-08-04T10:37 out of reach. Exactly
    8 of 35 outstanding rows remained visible, with nothing on screen
    indicating the rest existed.
    `paymentStatus` was ALREADY in registrationListFiltersSchema and WAS being
    applied — but only in the service's post-join pass (`applyPostJoinFilters`),
    which runs on a page that has already been cut. That is the whole defect:
    filtering after the slice can only ever filter what survived it. Now both
    `selectRegistrationList` and
    `selectAllRegistrationsForExport` narrow the registration id set from
    `payments` BEFORE ordering/ranging, the enum gained 'outstanding' (anything
    not fully Paid, what a collections screen actually wants), the screen asks
    the server for it, Export CSV inherits the same filter, and a truncation
    warning shows whenever `total > rows.length` so a partial view can never
    look complete again. Verified against production: 8 of 35 → 35 of 35.
    FOLLOW-UP (same day, caught in production): adding 'outstanding' to the
    enum without teaching `applyPostJoinFilters` about it made the screen read
    "No outstanding payments" — that pass compares with ===, and no row's
    payment_status is ever the string 'outstanding', so it filtered everything
    out. Both layers must understand every value the enum accepts; covered now
    by tests in registrations-service.test.ts. The same bug silently emptied
    the "outstanding" CSV export, which shares that function.
    Not fixed here (still latent): every other consumer of this list read has
    the same 200-row ceiling with no pagination UI. Worth revisiting once any
    single filtered view can exceed 200 rows.

  Date-range filters across the staff screens (2026-08-06) — founder: "include
    a date range filter ... on all relevant tabs even including the dashboard."
    Shared `components/ui/date-range-filter.tsx` (from/to inputs, Last 7 days /
    Last 30 days / This month presets, clear, inverted-range warning) plus
    `lib/date-range.ts` (`parseDateRange` for routes, `timestampBounds` for
    repositories). Wired to: dashboard, payments, registrations, leads, sales,
    certificates, calls.
    EVERY one filters SERVER-side, which is the whole point rather than a
    detail: these list reads are capped (registrations 200/page, leads 500,
    certificates and call_log by `limit`), so a browser-side date filter would
    only ever search the rows that survived the cap — the same defect that made
    the Payments screen show 8 of 35 outstanding balances. Date filtering was
    therefore added to `selectLeads`, `selectCertificates`,
    `selectOpportunities` and `selectRecentCalls`, and their routes now parse
    the range through the shared helper (a malformed date is a 400, never a
    silent "no filter").
    `timestampBounds` extends dateTo to 23:59:59.999 of that day. Not cosmetic:
    verified against production, a single-day filter for 2026-08-06 returns 92
    registrations with the inclusive bound and 0 with a naive midnight bound.
    Dashboard specifics: the range filters REGISTRATIONS, not batches — a
    cohort that started outside the window can still have taken registrations
    inside it, so filtering by batch would lose that money from every figure.
    Batches left with no in-range registrations drop out of the per-course
    table. Tiles keep their "this month" meaning when no range is set and
    relabel to the chosen window when one is; the range lives in the URL
    (`/dashboard?dateFrom=&dateTo=`) so it survives refresh and can be shared.
    Total Outstanding is a live balance and is deliberately never date-filtered.
    Known limitation, unchanged: dashboard revenue is still amounts received
    against registrations CREATED in the window, so a payment collected inside
    a narrow window against an older registration is not counted (payment_date
    granularity remains the Phase 2 refinement).
    Not wired (deliberately): attendance and course-feedback are batch-scoped —
    you pick a course and cohort, and a date range on top would filter within a
    single session. Campaigns, partners, corporate left alone for now.
    Also fixed in passing: four repository files were briefly re-encoded by a
    PowerShell `Set-Content` (BOM + cp1252 mojibake on every em-dash) and
    repaired; if a bulk edit ever mangles non-ASCII again, reverse the
    UTF-8→cp1252→UTF-8 double encoding rather than hand-fixing characters.

  Written-off registrations (2026-08-09) — founder: unpaid no-shows must stop
    "sitting on their account" and stop adding to receivables "as if they're
    obliged to pay". The gap was real and total: `registration_status` had
    'Cancelled' and 'Attended' in its CHECK constraint since the foundation
    migration, and BR-06 described an admin setting 'Cancelled' by hand, but
    NOTHING in the codebase had ever written either value — the only transition
    that existed was Registered -> Confirmed, fired by the payment trigger. So a
    registrant who never paid and never attended stayed open forever: counted in
    the dashboard's Total Outstanding (which took every registration on an active
    batch with NO status filter at all), sat in the Payments "outstanding" queue
    beside real debtors, occupied a seat in the capacity count, and kept a live
    Pay Now button on their own portal for a course that ended months ago. The
    only tool for clearing one was a hard DELETE, which destroys the very fact
    worth keeping.
    New 'Lapsed' status (migration `202608090059`), deliberately NOT a second
    meaning for 'Cancelled' — "they went quiet on us" is a re-marketing audience
    and a lead-quality signal, "they told us no" is the opposite, and merged they
    can never be separated again except by string-matching free text. Carries
    `lapsed_at`/`lapsed_by`/`lapsed_reason`, enforced together by a CHECK
    (`lapsed_by` NULL means the sweep did it, not a person; `lapsed_at IS NULL`
    is also the sweep's idempotency key).
    `amount_paid` is NEVER touched — zeroing a balance by inventing a payment
    would put money in the revenue figures that never arrived. The balance stays
    on the row as a fact; the STATUS is what makes it non-collectible. A
    fully-paid registration therefore cannot be written off at all.
    Two paths: `POST /api/registrations/[id]/lapse` (admin + finance — a
    receivable is finance's call, so the write is service-role with the service
    layer as the authorization boundary, since only admin holds an RLS UPDATE
    policy on registrations; `DELETE` on the same route reinstates), and a
    nightly sweep in the 07:00 cron closing anything 15 days past its batch's
    end_date with `amount_paid = 0` and zero attendance rows. Part-payers are
    deliberately excluded (founder decision) — real money changed hands, so
    refund/credit/chase is a human decision; they stay in receivables until
    written off by hand, which is what makes the manual action load-bearing
    rather than a convenience. Attendance is tested as row EXISTENCE, not against
    MIN_ATTENDANCE_RATIO, matching the 2026-08-08 feedback decision that any
    appearance however brief counts as turning up. Free batches are excluded
    outright (auto-Paid at GHS 0, so nobody on one is a debtor).
    The sweep is SILENT — no email/SMS/WhatsApp/call. "We've written off the
    course you didn't attend" is a collections letter nobody asked for, and the
    balance is not being pursued; that is the whole point.
    Read side is where the receivables figure actually changes: dashboard
    (expectedRevenue AND outstandingBalance), the Payments 'outstanding' filter
    in BOTH the repository pre-narrow and `applyPostJoinFilters` (the 2026-08-06
    lesson — both layers must understand every value), CSV export, the
    payment-reminder query, all three voice money/no-show queries, and the seat
    count. That last one is `courses/repository.ts`'s `.neq(..., 'Cancelled')`,
    the ONE seat-affecting read phrased as a negative and so the one place a new
    status is silently wrong rather than loudly wrong (`parseMember` throws on an
    unknown value everywhere else).
    Portal keeps showing the real balance — hiding it is its own kind of lie —
    marked "Closed — not collected", but withdraws every surface that would take
    a payment. A single `amountPayable()` helper is the one predicate the whole
    page uses, so a new payment surface cannot quietly miss the rule. The
    endpoints refuse too, not just the buttons (installment plan, payment-proof
    submission, coupon). Paystack's Pay Now is deliberately NOT gated: it is
    client-initiated and webhook-reconciled, and if real money arrives it must be
    recorded — that lands as the Lapsed + Paid anomaly BR-06 already describes,
    resolved with reinstate (EC-11).
    `RegistrationStatus` was converted from a hand-written union to a
    `REGISTRATION_STATUSES` tuple (same pattern as STAFF_ROLES) while adding the
    value — the parser used to repeat the list, which is two copies to keep in
    step.
    `POST /api/cron/registrations/auto-lapse` is a CRON_SECRET-gated manual
    trigger, DRY-RUN BY DEFAULT and not in vercel.json — the first real run closes
    the ENTIRE historic backlog in one pass, so it should be inspected first.
    BR-35 through BR-41 and EC-11/12/13 in Document 4. Migration
    `202608090059_registration_lapse.sql` applied to production 2026-08-12 and
    verified present in `supabase migration list`. The sweep is therefore now
    live inside the 07:00 cron; `POST /api/cron/registrations/auto-lapse`
    remains dry-run by default and out of vercel.json, and its first REAL run
    still closes the entire historic backlog in one pass — inspect the dry-run
    output before letting it write.

  Late registration — BR-19 now closes on end_date (2026-08-12) — founder-
    reported: a registrant took the Enterprise Risk Management intake on
    2026-08-11 but could not take the AI-Powered Financial Reporting one,
    because that class had already begun. Not a bug in the ordinary sense —
    BR-19 said `start_date >= current_date` and did exactly that — but the rule
    was wrong: a cohort became unreachable at midnight on its own first day
    while still running for weeks afterwards, and there was no route in at all,
    since `createRegistration` re-checks the same condition server-side (so a
    deep link with a known batchId was refused too). The only way in was the
    staff bulk import, which deliberately skips the gate.
    The window is now `end_date >= current_date` in all five places that
    expressed it, moved together on purpose: the public form's query
    (`selectActiveFutureBatchesPublic`, renamed `selectActiveJoinableBatches
    Public` — the old name would now be a lie), the public course catalogue
    (`selectPublicCourseCatalogSystem`, else /courses and /register disagree
    about what is joinable), `createRegistration`'s gate, `transferRegistration`'s
    destination gate, and the staff transfer picker's client-side filter in
    RegistrationDetailDialog (which must match the server or it hides what the
    server would accept). NO migration — this is a query/predicate change only;
    `end_date` is already NOT NULL on batches.
    Closing an intake early remains `is_active = false` (BR-01). That separation
    is the point: the date window says "is this cohort still running", the flag
    says "do we want more people in it" — the old rule could not express
    "started, but still open" because it conflated them.
    A late joiner is told, not silently enrolled: the form labels a started
    intake "in progress" and, on selection, names its start/end dates and says
    earlier sessions have been missed; the portal's Explore panel reads "In
    progress until <date>"; the voice agent's get_course_catalog says "already
    in progress since X, running until Y, still open to join" instead of
    "starts <a date last week>".
    Unchanged on purpose: early-bird pricing needs no special case (a started
    batch's discount_cutoff_date has necessarily passed, so effectiveCourseFee
    already returns full fee); a started-and-full batch still routes to the
    waitlist; the welcome email's .ics carries a past start date, which is
    harmless and better than suppressing the invite.
    KNOWN GAP, deliberately left for a founder decision: modules/voice/
    repository.ts's payment_followup and bank_transfer_chase still filter
    `start_date >= today`, so an unpaid late registrant gets no payment-chase
    call. That is a call-policy question ("do we phone people about a course
    already under way"), not a registration-window one. BR-19 rewritten, EC-14
    and EC-15 added to Document 4.

  One-click re-enrolment for existing accounts (2026-08-12) — founder: "those
    with an already existing account should not go through the same process of
    registering since their information is already captured, and they only have
    to enrol on to the course they're interested in." The student portal's
    Explore panel ended in a plain <a href="/register?batchId=">, so someone
    already signed in was dropped into the blank public form to re-type their
    name, gender, email, phone, job title, company, lead source and consent —
    every one of which is already on their participants row.
    `POST /api/portal/enrol` now takes a batchId (plus an optional coupon) and
    nothing else; WHO is enrolling comes from the portal session cookie, never
    the request body, so it cannot register anyone but its caller. It does not
    write a Registration itself — `registrationsService.enrolExistingParticipant`
    rebuilds the form input from the stored record and calls the SAME
    createRegistration the public form posts to, so BR-01/02/03/19, the
    capacity/waitlist branch, coupon + partner attribution, the welcome/payment
    emails, lead capture and the sales opportunity all keep working with no
    second implementation to drift. A full batch returns outcome 'waitlisted'
    exactly as the public form does.
    BR-15 is satisfied from participants.consent_given/consent_at rather than a
    fresh checkbox (founder decision) — consent is to processing their personal
    data, given once, not a per-course question. Still ENFORCED: a record with
    no consent is refused and sent to the full form rather than waved through.
    Profile fields are TOPPED UP, never re-collected: gender/jobTitle/company
    may be supplied but are used only where the record has a gap (legacy
    imports); anything still missing returns MISSING_PROFILE_FIELDS naming just
    those, and the portal reveals inputs for those alone.
    NEW LEAD SOURCE 'Returning' (migration 202608120060) — the enum had no
    honest answer for someone who already has an account. Carrying their
    original source forward re-credits that channel on every future course
    (lead_source feeds the dashboard, leads filters and campaign audiences);
    'Other' is the genuine-unknown bucket and burying repeat enrolments there
    destroys the repeat-enrolment rate. Same reasoning as 'Lapsed' vs
    'Cancelled' three days earlier. It is SYSTEM-ASSIGNED, never self-declared:
    `publicRegistrationInputSchema` (new, used by POST /api/registrations)
    rejects it, as do the bulk import, corporate employee-add and the
    assistant's propose_create_lead; reads take the full set. Both CHECK
    constraints moved — registrations AND waitlist_entries, the latter not
    optional since a returning student enrolling onto a FULL batch takes the
    waitlist branch with the same lead_source. leads.lead_source has no CHECK
    (only status does) so no migration, but its app-side enum had to gain the
    value or createLead silently rejects every returning student's lead row.
    While adding it, LeadSource became a LEAD_SOURCES tuple in lib/domain/types
    (same pattern as STAFF_ROLES/REGISTRATION_STATUSES) — the literals were
    repeated in eight places; SELF_DECLARED_LEAD_SOURCES is the input subset.
    ARCHITECTURE NOTE: enrolExistingParticipant lives in modules/registrations,
    not modules/portal, because registrations/service.ts ALREADY imports
    ensureParticipantAuth from portal/service.ts — putting it in portal and
    importing registrations back made the two modules circular. The route
    composes them: portal answers "who is this", registrations creates the
    Registration. Creating a Registration is that aggregate's job anyway.
    BR-42/BR-43 in Document 4; Document 1's glossary, Document 3's schema and
    Document 11's example updated. Migration `202608120060_returning_lead_
    source.sql` applied to production 2026-08-12 and verified present in
    `supabase migration list`. Note the ordering is the safe one: the CHECK
    constraints now ACCEPT 'Returning' while no deployed code writes it yet, so
    the schema is ahead of the app rather than behind it. Deploying the code
    first would have made every re-enrolment a constraint violation.

  Voice payment-chase reaches running cohorts (2026-08-13) — founder-directed
    follow-on from late registration. `payment_followup` and
    `bank_transfer_chase` filtered on `start_date >= today`, which was
    near-tautological while BR-19 also closed registration on start_date (no
    unpaid registration could exist on a started batch). Late registration broke
    that pairing: an unpaid late registrant was chased by nothing at all, while
    consuming the course they owed for. Both now use `end_date >= today`;
    bank_transfer_chase keeps its "no more than 3 days before the start" upper
    bound, so only the lower bound moved. Chasing still STOPS at end_date —
    money owed on a finished course is a different conversation, and the BR-38
    sweep closes that population 15 days later.
    Cannot become nagging: reserveCallSlot inserts (registration_id, call_type)
    under a unique constraint before dialing, so it is one call of each type per
    registration ever; widening a window changes who is reachable, never how
    often anyone is rung.
    MANUAL STEP OUTSTANDING: the Vapi system prompt says "starting
    {{start_date}}", which is false for a cohort that began last week — a money
    call opening on a false statement. The dispatcher now computes
    `{{course_timing}}` server-side (courseTimingPhrase) and sends it alongside
    the unchanged {{start_date}}. Prompt text lives in the Vapi DASHBOARD and is
    not deployable from this repo — see Document 7 §11.3 step 6 for the paste.
    Additive, so nothing breaks before it is done; the wording is just wrong for
    late registrants. (Voice is still dormant anyway until VAPI_* is set.)

  Returning-participant nudge + repeat-enrolment metric (2026-08-13) — founder
    asked how a logged-out repeat registration is deduplicated and how such a
    person gets enrolled as returning. Answer, now written up as BR-44: same
    email is fully deduplicated at the DATABASE (participants.email unique, then
    unique(participant_id, batch_id) -> 409 DUPLICATE_REGISTRATION for the same
    batch, different batch permitted per EC-01); a DIFFERENT email is not
    deduplicated at all, since phone is deliberately not unique (shared
    household/office numbers), so that person becomes a second Participant with
    a second portal login — known and accepted, merging is a manual staff action.
    Two changes from it. (1) The public form now carries a standing prompt above
    the fields pointing returning participants at the portal. Shown
    UNCONDITIONALLY, not triggered by looking the typed email up: a public "does
    this address have an account?" check is an account-enumeration oracle, and
    portal login, tutor login, portal forgot-PIN and staff forgot-password all
    deliberately return identical responses so they cannot be used to probe who
    is a participant. The prompt reaches the returning student either way and
    tells a stranger nothing. (2) NEW DASHBOARD TILE "Repeat Enrolments",
    derived from registration HISTORY, not from lead_source = 'Returning'.
    'Returning' marks the PATH (portal one-click) rather than the fact of coming
    back, so counting it undercounts anyone re-registering through the public
    form — where picking a real marketing channel is the correct answer, since
    that channel is what re-reached them. Any registration that is not a
    participant's first is a repeat, which is exactly computable.
    `selectRepeatEnrolmentStats` deliberately does NOT reuse selectDashboardData
    (that read is scoped to ACTIVE batches, so someone whose first course ran on
    a since-deactivated cohort would look like a first-timer), excludes
    Cancelled/Lapsed from the measured population like every other dashboard
    figure, but applies NO status filter to the history lookup — a prior
    registration they cancelled still means they are not new to us. Honours the
    dashboard date range so the tile describes the same window as the others.

  Platform convergence with KnowsiaApp — DIRECTION SET, NOTHING BUILT
    (2026-08-13). Founder surfaced a second, separate codebase: `KnowsiaApp`
    (github.com/kwameaikins/KnowsiaApp) — FastAPI/Python 3.12 + Next.js 15 on
    Railway/Supabase Pro/Upstash/Celery, an AI exam-prep platform (ICAG/ACCA/
    ICAN question bank, RAG AI tutor, self-paced LMS, subscriptions with a
    14-day trial, tutor marketplace, marking engine). It is BUILT BUT NEVER
    LAUNCHED — 272 tests pass, but no live keys, Cloudflare Stream unverified,
    Grok unexercised, notification senders stubbed. This repo is the opposite:
    live, real money, real cohorts, bugs found against real traffic. Both serve
    the SAME person (a Ghanaian accounting professional), who today would hold
    two accounts and two logins.
    DECISION: integrate the product, DO NOT merge the codebases. Porting either
    way means rewriting Python ML/RAG/Celery into TypeScript or abandoning a
    shipped registration surface — months, ending with less than exists now,
    while the only system earning money sits frozen.
    THE BINDING RULE, and the whole point of the exercise: PEOPLE AND MONEY
    HERE; LEARNING CONTENT AND AI THERE; NEITHER SYSTEM REBUILDS THE OTHER'S
    HALF. A capability has exactly one owner; a request landing on the wrong
    side MOVES rather than being implemented twice. Full ownership table in
    `Coding Docs/19_Platform_Convergence.md` §3 — read it before building
    anything that sounds like studying, questions, or AI tutoring.
    The overlap turned out far smaller than it looked, because KnowsiaApp had
    deferred or stubbed almost exactly what this repo shipped for real: M10
    Affiliate (deferred there, four partner tiers live here), M11 CRM (deferred
    there in favour of HubSpot, Revenue OS live here), and the `notif_`
    email/SMS/WhatsApp senders (stubs there, Resend/Arkesel/Meta live here) —
    all three are now on a stop-building list. Only four genuine conflicts
    existed: certificates (stays HERE — `/verify` URLs are already printed on
    101 issued certificates and cannot move), corporate (HERE — real companies
    have bought seats), payments (course fees HERE, subscription billing there;
    two commercial models, one provider, no shared code), and tutors — which
    are NOT the same concept: this repo's tutors teach your cohorts, M9's
    tutors sell their own courses. Whether Knowsia runs a marketplace at all is
    an open PRODUCT question and the two must not be merged before it is
    answered.
    Integration seams, founder-ordered: (I) account link + short-lived
    single-use handoff token between `participants` and `m1_users` —
    deliberately NOT full SSO, and identity comes from the existing session
    never a request body; (II) one domain via Vercel path rewrites, both
    frontends being Next.js; (III) a paid cohort granting question-bank access,
    hanging off the existing `runPaidTransitionSideEffects` rather than a new
    trigger. NONE of it starts before the Paystack test-mode gate clears and
    this repo goes live. Neither system reads the other's database — HTTP only,
    which is Rule 2 there and the module boundary rule here, and it does not
    stop applying at a process boundary.
    NOT DONE, and the boundary is half-bound until it is: §3 must be mirrored
    into KnowsiaApp's own CLAUDE.md. A rule written in one repo binds one repo.

  Seam I — KnowsiaApp account link, REGISTRATION HALF BUILT (2026-08-13).
    Founder directed building despite Document 19 §7's "nothing starts before
    go-live" — it ships DORMANT (both KNOWSIA_APP_URL and
    KNOWSIA_APP_SERVICE_KEY unset ⇒ the portal banner never renders and
    POST /api/portal/handoff returns 503), so production is unchanged until
    those are set. Same dormant-until-configured posture as WhatsApp, Arkesel,
    Vapi and R2.
    Shape: an OPAQUE SINGLE-USE TOKEN + service-key callback, not a
    self-contained JWT. Third instance of a pattern this repo already had twice
    (portal_login_tokens, participant_pin_reset_tokens) — the row's id IS the
    token, consumed by an atomic conditional UPDATE, RLS enabled with zero
    policies. Chosen over a JWT because the token travels in a URL query string
    and WILL be logged by the other system and the browser: single-use plus a
    required KNOWSIA_APP_SERVICE_KEY on redemption makes an intercepted token
    worthless, whereas a JWT is replayable for its whole TTL. No new dependency
    either (`jose` is not in package.json). TTL 60 seconds, not the 15 minutes a
    PIN reset gets — a machine redeems this inside a browser redirect.
    BR-45 is the rule that keeps the two systems apart: A HANDOFF PROVES
    IDENTITY, NEVER ENTITLEMENT. The verify response carries participantId/
    email/fullName/phone and nothing else — no registration, payment, or access
    field, ever. Widening that payload is precisely how Seam I quietly becomes
    Seam III with entitlement logic split across two systems and neither owning
    it. There is deliberately NO status gate either: a Lapsed or Unpaid
    participant still has a valid identity; the only check is deleted_at (BR-16).
    POST /api/portal/handoff takes NO REQUEST BODY AT ALL — who it is for comes
    from the session cookie, so it cannot be pointed at another participant
    (same rule as POST /api/portal/enrol). It is a POST not a GET because a GET
    would be prefetchable, which would burn single-use tokens on link hover.
    verify and link are separate endpoints on purpose: verify consumes a
    single-use token and must succeed exactly once, link is idempotent and
    retryable, so a failed link after a successful user-create doesn't need a
    fresh handoff. A link never MOVES — re-linking the same pair is a no-op, a
    different KnowsiaApp user for an already-linked participant is a 409.
    New top-level route group `/api/integration/**` for machine callers from the
    other platform, distinct from /api/cron (scheduled self-calls) and
    /api/public (WordPress catalogue). middleware.ts matches only staff PAGE
    routes so it does not apply.
    950 tests pass (15 new), lint and tsc clean, build compiles.
    Migration `202608130061_knowsia_app_account_link.sql` APPLIED to production
    2026-08-13 and verified present in `supabase migration list` (62
    migrations, 0 pending). Ordering is the safe one — schema ahead of app, so
    the columns exist while nothing writes them yet. KnowsiaApp's half (accept
    token, verify, find-or-create m1_users, link, store its own back-link) is a
    separate repo and a separate pass.
    Resolved during the same session: a full duplicate of the KnowsiaApp repo
    had been copied INTO this working tree, which broke `npx tsc --noEmit`
    (167 errors) and `npm run lint` (677 errors) — every one of them
    KnowsiaApp's files resolved against THIS repo's tsconfig, which includes
    `**/*.ts` and excludes only node_modules. Deleted after verifying it was
    byte-identical to `E:\KnowsiaApp` (same HEAD, clean tree, no stashes, all 8
    gitignored .env files matching sizes and timestamps). NOTE FOR NEXT TIME:
    `Remove-Item -Recurse` CANNOT delete that repo — `.git/refs/codex/
    turn-diffs/checkpoints/...` exceeds the Windows 260-char path limit and the
    delete half-completes. Use `robocopy <empty-dir> <target> /MIR` then
    remove the emptied directory.
    SEPARATE PRE-EXISTING ISSUE, not caused by any of this: `npm run build`
    exits 1 on Windows with `uncaughtException [Error: kill EPERM]` AFTER
    printing "Compiled successfully", and never writes routes-manifest.json.
    Confirmed pre-existing by building `main` without these changes — identical
    failure. It is a Node worker-teardown problem specific to Windows, so
    Vercel's Linux builds are unaffected, but `npm run build` is NOT a reliable
    local green light on this machine. Verify a build by checking
    "Compiled successfully" plus the artifacts under `.next/server/app/`,
    not by the exit code.

  Knowsia Live self-hosted RTC — ASSESSED, NOT BUILT (2026-08-13). Founder
    supplied `Coding Docs/knowsia-live-mediasoup-engineering-plan.md`, a
    mediasoup-based plan to replace Zoom with an owned WebRTC classroom
    (500 participants, sharded routers, own recording pipeline, exact
    attendance). Assessed against the existing stack; three decisions taken
    and written up as `Coding Docs/18_Knowsia_Live_RTC.md`. (1) DO NOT BUILD
    NOW — the product has not launched (Paystack test gate and pivot gate both
    unreached), Live Learning L1 is itself incomplete (batch schedule
    generator and provider adapter pending), and the plan's headline benefit
    was largely delivered by the 2026-08-06 attendance work; the one real
    remaining identity gap is the open `ensureZoomRegistration` decision
    below, which is days of work rather than a year. (2) SFU CHOICE SETTLED:
    LiveKit self-hosted, NOT mediasoup — same deployment ownership, and it
    ships simulcast, active speaker, multi-node, recording/egress and the
    token identity model as built-ins, i.e. most of the source plan's
    sections 4-7/13/20/28; the source plan's own §34 says not to modify the
    mediasoup worker anyway, so the ownership argument for it was thin.
    (3) BUDGET UNRESOLVED and blocking any build — ~570 GB egress per
    500-person 3-hour class, so bare metal or nothing.
    Two structural notes for whoever picks this up. The fit is genuinely good
    where it matters: `live_session_attendance` (migration 202607250027) was
    built provider-agnostic — `source` defaults to 'zoom', there is already a
    `unique (live_session_id, registration_id)` idempotency key and a
    `reviewed_at`/`reviewed_by` lock — and has simply never been written to,
    so a `'knowsia_live'` source value is the whole schema change. RTC
    attendance must roll through it into the existing `attendance` table, NOT
    into the source plan's parallel `rtc_*` model: on a free Batch an
    attendance row is what makes a certificate issuable, and a second
    attendance system beside the one certificates read is how you get two
    disagreeing answers to "did they attend". Identity is nearly free here —
    the portal PIN + session cookie pattern already carries
    registration/batch/role, so the token is minted from the session cookie,
    never the request body (same rule as POST /api/portal/enrol).
    Recorded exception in Document 14 §1: if ever built, exactly ONE extra
    always-on deployable (Vercel cannot host an SFU), not the six services the
    source plan proposed — and not a precedent for splitting the monolith.
    Prerequisite work in PLAN.md is owed regardless and is $0: P1 provider
    adapter (`LiveSession.provider` is already a `'zoom'` literal in
    modules/live-sessions/types.ts — widening it is required by Document 14 §1
    for Teams/Meet anyway, and is what keeps the SFU choice cheap to reverse),
    P2 close the Zoom registrant gap, P3 finish L1's schedule generator.

  Tutor-tier authorization pass + BR-33 revision (2026-08-13). Ran the "live
    RLS pass for Tutor" that had been open since the Week 4/5 checklist. The
    tier is structurally sound: all 20 tutor-portal routes read the session
    cookie and delegate to tutorsService (no route does its own data access);
    every batch-scoped service function calls requireOwnBatch and every
    assignment-scoped one requireOwnAssignment, both resolving the (id,
    tutorId) pair server-side so no client-supplied id is ever trusted;
    removeSessionMaterial is stricter still (uploader-only, 403 even on your
    own batch); RLS is enabled on all 8 tutor-touched tables; and the Phase-4
    bug class has NOT recurred — staff CRUD uses the RLS client, all 24
    cross-module calls resolve to service-role reads or tutor-safe writes, and
    the four non-`System` writes each have an explicit `AsStaff` sibling that
    does requireRole, so the split is deliberate.
    ONE REAL FINDING, now resolved by DECISION rather than by code: the
    Certificate Eligibility panel had been rendering a per-participant
    Paid/Unpaid pill since it shipped, contradicting BR-33 ("never any
    payment/financial data") AND Document 16 §11's claim that tutor payment
    visibility was deferred and unbuilt. Founder decision on review: the
    BOOLEAN STAYS — on a paid Batch eligibility IS the payment gate, so a
    verdict without its reason is unreadable — and BR-33 was REWRITTEN around
    the real line, which is STATUS vs FIGURE, not payment vs no payment.
    Allowed: a settled/unsettled boolean, and only where it explains
    certificate eligibility. Never: amount_paid, course_fee, balance,
    discount, payment date/method/reference — no figure, anywhere. The roster
    keeps its stronger architectural guarantee (selectRosterForBatchSystem has
    no payments join at all, so nothing is fetched to strip).
    Also fixed while pinning it: getCertificateEligibilityForBatch used to
    return getBatchIssueContext's candidates VERBATIM, so the tutor payload was
    whatever modules/certificates happened to return — an amount added there
    for the staff Certificates screen would have reached tutors silently. It
    now projects every field explicitly, so adding one is a deliberate act. A
    new test proved this was a live weakness, not a hypothetical: it failed
    against the pass-through and passes against the projection.
    `tests/unit/tutor-payment-isolation.test.ts` pins both halves (the boolean
    IS exposed and must stay; no figure may appear even if upstream grows one).
    Document 16 §11 still needs founder sign-off for AMOUNTS — that half of the
    scope question is unchanged and still unbuilt.
    Both nits from the pass were then FIXED (same day):
    (1) `certificatesService.getBatchIssueContext` → `...ContextSystem`. It has
    no internal authorization — all three callers gate separately (admin route
    requireRole, tutor service requireOwnBatch, agent-tools' own trust tier) —
    so the missing suffix was the only thing wrong. That suffix is load-bearing:
    it is the signal this very audit used to triage 24 cross-module calls, and a
    function that lies about its contract undermines the next one.
    (2) Download-URL ordering, in BOTH portals. `getMaterialDownloadUrl` minted
    the R2 presigned URL and THEN checked ownership — safe only because the
    throw came before the return. The documented contract ("caller authorizes
    the batch BEFORE calling this") was in fact unsatisfiable, since that
    function was the only way to learn which batch owned the material. New
    `liveSessionsService.getSessionMaterialBatchIdSystem` makes it satisfiable;
    tutor and student portals now resolve the batch, authorize, and only then
    sign. Both tests assert the presigned call is NEVER reached on refusal,
    which is the property that actually matters.

  ZOOM REGISTRANT GAP — ROOT CAUSE PROVEN (2026-08-14). The month-old mystery
    is solved, end to end, by dumping the Server-to-Server token's own scope
    list and then calling Zoom directly instead of inferring from docs.
    SCOPES THE APP ACTUALLY HAS: `meeting:write:meeting:admin` (CREATE only),
    `meeting:write:registrant:admin`, `dashboard:read:list_meeting_participants
    :admin`. SCOPES IT DOES NOT HAVE: `meeting:read:meeting` and
    `meeting:update:meeting`. Zoom SPLITS create from update —
    `meeting:write:meeting` does NOT cover modifying an existing meeting. I
    initially misread the list and told the founder we could change meetings;
    we cannot.
    AND THE MEETINGS HAVE REGISTRATION OFF. Zoom, asked directly:
    `POST /meetings/84968782138/registrants` ->
    `{"code":404,"message":"Registration has not been enabled for this meeting"}`.
    That one line is the whole cause. Not a code bug, not a wiring bug: the
    meetings were made by hand with registration off, and the app has no
    permission to turn it on.
    THEREFORE both helpers written on 2026-08-13/14 are currently inert against
    real meetings: `getMeetingRegistrationState` (needs meeting:read) and
    `enableMeetingRegistration` (needs meeting:update). Both now fail cleanly
    and say why rather than pretending. Treat `registrationEnabled`/
    `approvalType` = null as UNKNOWN, NEVER as "fine";
    `registrationStateReadable` says which.
    RESOLVED SAME DAY — founder granted `meeting:read:meeting:admin` and
    `meeting:update:meeting:admin` at marketplace.zoom.us. Both verified
    present in the token's scope list afterwards. Both blocked helpers work now.
    WITH THE READ SCOPE, ALL FOUR MEETINGS READ BACK approval_type=2 —
    account-wide, not a one-off: 84968782138 (AUG 2026, class 08-15),
    82545109642 (July 2026, runs to 08-16), 81420483944 (ESG2, finished),
    89951984118 (IA02, finished). Every hand-made meeting has registration off,
    which is exactly why zoom_registrants was empty for a month.
    FIRST SUCCESSFUL RUN, class of 2026-08-15 (batch 98433b5e): registration
    switched 2 -> 0 (read back to confirm), 2 of 3 students registered with
    personal links stored and zoom_link emailed — THE FIRST ROWS
    zoom_registrants HAS EVER HELD. The 3rd failed on a Zoom 429: the
    add-registrant limit is 3 PER DAY PER REGISTRANT EMAIL, and that address had
    been used as the probe while diagnosing the 404 earlier the same day.
    LESSON: never diagnose against a real participant's email — use a throwaway
    or an unenrolled meeting. Limit resets 00:00 UTC; a Windows scheduled task
    `KnowsiaRegisterLateStudent` (00:10 on 08-15, script at
    E:\dev\temp\knowsia-ops\register-late-student.ps1) re-runs the backfill,
    which is idempotent so it picks up only whoever still lacks a link.
    NOT DONE, awaiting founder: the July 2026 batch (82545109642) is MID-COURSE
    to 08-16 — enabling registration there sends students holding the shared
    link to a sign-up page with two sessions left. The two finished batches gain
    nothing and should be left alone.
    REVERSED SAME DAY: a brief rule "never modify an existing Zoom meeting".
    Founder said "the zoom should not be touched" meaning DO NOT REPLACE ZOOM
    with self-hosted video (Document 18) — not this checkbox, which is the one
    thing that makes attendance exact. The misreading cost a round trip; it is
    an easy one to repeat, hence this note. `enableMeetingRegistration` is
    live again, wired to the backfill's explicit `enableRegistration` flag,
    ignored on a dry run, human-triggered only.
    `enableMeetingRegistration` is IDEMPOTENT — a no-op when registration is
    already on — so it is safe to send without reading first.
    NOTE a real run of the backfill EMAILS every registered student their
    personal join link (`zoom_link` template) — on a large batch that is a mass
    send. Check `eligible` on the dry run first.

  Zoom registrant gap — INSTRUMENTED AND REPAIRABLE (2026-08-13). The
    longest-standing open item: `ensureZoomRegistration` had never written a
    single `zoom_registrants` row account-wide despite the app holding
    `meeting:write:registrant`, so every session fell back to display-name
    inference (which is why the ESG2 backfill needed the loosened
    `minSharedTokens: 1` tier that knowingly produces some wrong rows feeding a
    certificate gate).
    NOTHING WAS WIRED WRONG. Every Paid path does reach it —
    runSettledEnrollmentSideEffects is the single funnel and it calls
    ensureZoomRegistration, for free batches too (runZeroFeeEnrollmentSideEffects
    delegates to the same function). The defect was that the failure was
    INVISIBLE: `addMeetingRegistrant` threw into callers that only
    console.error, and the `'failed'` outcome existed in the type but was never
    returned and never inspected. A permanent account-wide failure and a
    success looked identical from outside. Exactly the shape of the 2026-08-06
    attendance bug one layer up (errors landed in summary.errors, cron returned
    200).
    THE LIKELY ROOT CAUSE, and the thing to check first: Zoom's
    `settings.approval_type` is a property of the MEETING, not of this app's
    permissions. 0 = auto-approve, 1 = manual approve, 2 = NO REGISTRATION
    REQUIRED — and POST /registrants ALWAYS fails against 2. A meeting created
    by hand in the Zoom console defaults to 2. Meetings this app creates
    (createCourseMeeting, createBatchClassroomMeeting) set approval_type 0 /
    registration_type 1 and are fine; the exposure is meetings created before
    auto-create existed or pasted in from the console. No scope grant fixes a
    2 — which is why granting `report:read:list_meeting_participants:admin`
    (still open below) would NOT have helped here.
    Built: `tryAddMeetingRegistrant` (non-throwing) so ensureZoomRegistration
    returns 'failed' and reports to Sentry instead of swallowing;
    `getMeetingRegistrationState` (reads approval_type — the actual diagnosis,
    rather than guessing from error strings, which is why no Zoom error CODE is
    hardcoded anywhere); `enableMeetingRegistration` (PATCH, mirrors
    enableCloudRecording); and `POST /api/cron/zoom/registrants/backfill` —
    CRON_SECRET-gated, DRY-RUN BY DEFAULT, not in vercel.json, same shape as
    the attendance backfill beside it.
    `enableMeetingRegistration` is DELIBERATELY NEVER CALLED AUTOMATICALLY, and
    is ignored on a dry run: turning registration on changes what the meeting's
    existing SHARED join link does for everyone already holding it, so for a
    cohort mid-course it is a live behaviour change a human must choose. Two
    tests pin that (never on dry run, never unless explicitly asked).
    NOT YET RUN against production — the dry form
    (`{"batchId":"<uuid>"}`) reports registrationEnabled/approvalType and costs
    nothing; run it on ESG2/IA02 first, since that single field is probably the
    whole answer. Doc 7 §9.4 has the full runbook.

Open decisions (founder):
  - Knowsia Live budget exception (~EUR 50-150/month bare metal). Not needed
    while the answer is "don't build"; revisit only once the product has
    launched, Live Learning L1-L3 are complete, and Zoom cost or capacity is a
    felt constraint rather than an anticipated one.
  - AI05 ("...Reporting and Modeling") vs AI02 ("...Reporting and
    Analysis") are near-duplicate courses — pick a canonical one.
  - Grant the Zoom app `report:read:list_meeting_participants:admin`. Not
    required any more (Dashboard fallback covers it) but the report API is the
    only one that returns participant emails, which is what makes matching
    exact rather than inferred.
  - Zoom meeting registration: instrumented and repairable as of 2026-08-13
    (see the entry above), but NOT yet run against production. Run
    `POST /api/cron/zoom/registrants/backfill` with `{"batchId":"<uuid>"}` on a
    real batch — the `approvalType` it reports is probably the whole answer.
    Until personal join links actually issue, every session still depends on
    display-name inference.
  - ~~Exposed legacy Supabase service_role key needs rotation.~~ ROTATED
    2026-08-14, founder confirmed .env carries the new key. Production verified
    still reading the database afterwards.
  - ~~Paystack TEST-mode end-to-end run (Week 2 gate).~~ CLOSED 2026-08-14 —
    NOT NEEDED, and the gate is satisfied by production rather than by a test.
    Checked against live data: 71 payments carry a Paystack transaction_id, and
    payment_method values of 'Paystack Card'/'MTN MoMo' are DERIVED BY THE
    WEBHOOK HANDLER ITSELF (paystack-webhook-handler.ts), so manual staff entry
    cannot produce them — those 71 went through checkout and the webhook. Both
    channels proven (card and MoMo), both terminal states proven (Paid and Part
    Payment), most recent GHS 469 on 2026-08-14. There are no sk_test_ keys
    anywhere; running "the test" with the live keys would have been a real
    charge, real money and a real production record. Do not do that — the thing
    the gate was protecting has already happened, hundreds of times, for real.

Still open from the original Week 4/5 checklist: Sentry DSN live-fired,
Uptime Robot monitor, remaining staff accounts, load test, manual pre-launch
checklist, final go-live. (Live RLS pass for Tutor — DONE 2026-08-13: the tier
is sound; one finding, resolved by revising BR-33 around status-vs-figure.
Document 16 §11 still needs sign-off for AMOUNTS.)

Feature backlog (lower priority, not yet built): session-days schedule
(superseded in part by the Live Learning Operations LiveSession model),
dashboard attendance/feedback/certificate metrics.

Pivot-or-persevere gate status: PASSED IN PRACTICE (2026-08-14). It was recorded
as blocked on "needs live Paystack test", which was written pre-launch and has
been stale for weeks: the system is live, taking real money through Paystack on
both card and MoMo, with the webhook deriving payment method and status
unaided. 71 transactions. Nothing is waiting on a test any more — the remaining
Week 4/5 items below are operational hardening, not gates.
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

*Full documentation suite: `Coding Docs/01_PRD.md` through `Coding Docs/19_Platform_Convergence.md`.*
*Live task tracker: `PLAN.md`.*
