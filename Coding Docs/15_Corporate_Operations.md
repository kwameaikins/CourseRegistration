# Corporate Operations Specification

Companion to `01_PRD.md` Section 18 (Corporate Registration Extension). Describes how a
corporate client buys seats in a course batch for its employees, pays by invoice/bank
transfer, and manages its own roster through a dedicated portal — separate from staff
accounts and the individual participant portal.

## 1. Operating Model

A **Company** is a corporate client (not a training provider, not a tenant — this system
remains single-tenant/internal per `01_PRD.md` Section 9). A company buys a **Seat
Allocation**: N seats in one Batch, at an agreed price per seat, billed by invoice. Staff (or
the company's own portal session, once seats are purchased) then adds named employees against
that allocation, up to its purchased quota. Each employee becomes a normal `Registration` —
certificates, attendance, the individual participant portal, and every existing email/
WhatsApp/SMS flow work unmodified, because a corporate-sourced registration is still just a
registration, tagged with which allocation paid for its seat.

## 2. Source of Truth

- `seatsUsed`, `amountInvoiced`, and `amountSettled` are never stored — always computed live
  from the linked `registrations`/`payments` rows (same "derived, not duplicated" principle as
  `payments.balance`). There is no mutable "invoice" record; the invoice PDF is generated on
  demand from the allocation's own data, same posture as certificate PDFs.
- The aggregate `payments` row per registration remains the sole source of truth for
  BR-04/05/06/12 — corporate billing is a grouping/tracking layer on top, not a second ledger.

## 3. Module Boundaries

`modules/corporate` owns `companies`, `company_batch_allocations`, `company_admin_auth`, and
`company_admin_sessions`. It calls `coursesService` (capacity checks/adjustments) and
`registrationsService` (employee registration creation) — one direction only. Neither
`courses` nor `registrations` knows `corporate` exists, avoiding a circular dependency (see
Section 5's capacity mechanism for why this shape was chosen).

## 4. Core Entities

- **Company** — `name`, `tin`, `billing_contact_name/email/phone/address`, `notes`.
- **Seat Allocation** (`company_batch_allocations`) — one company buying N seats in one batch:
  `seats_purchased`, `price_per_seat`, `status` (`active`/`completed`/`cancelled`).
- **Employee Registration** — a normal `registrations` row with `company_allocation_id` set.
- **Company Admin** — the company's own portal identity (`company_admin_auth`/
  `company_admin_sessions`), one per company for v1 (not per named contact).

## 5. Capacity Reservation

Invariant: `seatsRemaining = batch.capacity - COUNT(all registrations) - SUM(unfilled seats
across active allocations)`.

- `coursesService.adjustBatchCapacityInternal(batchId, delta)` — a silent, side-effect-free
  capacity nudge (no audit, no waitlist-notify), distinct from the public-facing `updateBatch`.
- Selling seats: validate against `getSeatsRemaining`, then reserve the full purchase via
  `adjustBatchCapacityInternal(batchId, -seatsPurchased)`.
- Filling a seat: `adjustBatchCapacityInternal(batchId, +1)` per employee added — converts a
  reserved-but-unfilled seat into a real counted registration; net public availability is
  unchanged, so no waitlist event fires.
- Cancelling an allocation: releases only the still-unfilled portion via the **full**
  `updateBatch` (so the existing waitlist-notify side effect fires correctly — this is a
  genuine net increase in public availability).

## 6. Role Responsibilities

- **Admin / Finance**: create companies, sell seat allocations, cancel/complete allocations,
  view all corporate accounts and revenue.
- **Marketing / Management**: read-only access to companies and allocations (same read tier as
  the rest of the Revenue OS screens).
- **Company Admin** (portal): manage its own employees within its own purchased quota only;
  never sees any other company's data (BR-29); can never mark a payment Paid (BR-12 — no
  staff identity exists for this session to be attributed to).

## 7. Security, Privacy, and Audit Controls

- Company admin auth mirrors the participant portal exactly: PIN + opaque session cookie
  (`company_portal_session`), not Supabase Auth. `company_admin_auth`/`company_admin_sessions`
  have RLS enabled with **zero policies** — reachable only via the service-role client, same
  "RLS as defense in depth, application code is the real gate" posture as
  `participant_auth`/`participant_sessions`.
- `companies`/`company_batch_allocations` use real RLS policies keyed on `fn_current_role()`
  (staff-only), matching every other staff-managed table.
- Lockout: 5 failed PIN attempts locks the company session for 15 minutes (BR-28), same
  parameters as the participant portal.
- BR-29 is enforced entirely in the service layer (`requireCompanyPortalSession` scoping every
  read/write to the session's own `companyId`) — there is no per-row RLS for this identity
  tier, consistent with how every other non-staff identity in this app is handled.

## 8. Company Admin Experience

Login (billing email + PIN) → dashboard listing every allocation (any status) with seats
filled/remaining, a paste-box "add employees" action capped at the remaining quota, an invoice
PDF download, and a per-employee payment-status view (read-only — settlement is always a staff
action via the existing Payment Tracking/Registration 360 screens).

## 9. Delivery Roadmap

- **Phase 1** (shipped 2026-07-26): staff-side company/allocation management, employee
  add-by-paste, on-demand invoice PDF, seat capacity reservation.
- **Phase 2** (shipped 2026-07-26): company admin portal (auth, dashboard, self-service
  employee add, invoice download).
- **Phase 3** (shipped 2026-07-26): staff dashboard corporate summary card.
- **Phase 4** (this document + doc updates): documentation backfill, including the
  previously-undocumented participant portal auth model (see `06_Security_and_Authentication.md`).
- Not yet built (future, not required for launch): multiple named contacts per company,
  a dedicated settlement/reconciliation screen (v1 relies on staff manually marking each
  employee's registration Paid), self-service seat top-ups from the company portal.

## 10. Acceptance Criteria

- Selling more seats than a batch has remaining is rejected (BR-26).
- Adding the same participant twice under one allocation is rejected the same way a duplicate
  registration always is (BR-27).
- Cancelling a partially-filled allocation returns exactly the unfilled seats to public
  capacity and notifies the waitlist if anyone is waiting (BR-30) — filled seats and their
  registrations are never touched.
- A company portal session can never read or write another company's data (BR-29), and can
  never cause a payment to be marked Paid (BR-12).
- The staff dashboard's corporate summary numbers always match the sum of the individual
  company/allocation detail screens (both computed from the same live source, never a
  separately-maintained counter).

## 11. New Business Rules

See `04_Business_Logic_Rules.md`'s "Corporate Registration Rules" section — BR-26 through
BR-30.
