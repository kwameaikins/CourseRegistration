# Centralised Course Registration & Follow-Up System
## UI/UX Screen Specification

---

| Field | Value |
|---|---|
| **Document** | UI/UX Screen Specification |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | AI Coding Agent |
| **Input from** | Document 1 (PRD), Document 5 (API Contract), Stage 5 Discovery (User Journeys) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Initial screen specifications — 8 screens |

---

## Table of Contents

1. [Design Principles Applied](#1-design-principles-applied)
2. [Screen: Public Registration Form](#2-screen-public-registration-form)
3. [Screen: Management Dashboard](#3-screen-management-dashboard)
4. [Screen: Registration List (Staff)](#4-screen-registration-list-staff)
5. [Screen: Payment Tracking](#5-screen-payment-tracking)
6. [Screen: Course Control Panel](#6-screen-course-control-panel)
7. [Screen: My Courses (Tutor)](#7-screen-my-courses-tutor)
8. [Screen: Staff User Management](#8-screen-staff-user-management)
9. [Global Navigation and Layout](#9-global-navigation-and-layout)
10. [Ready for Development Checklist](#10-ready-for-development-checklist)

---

## 1. Design Principles Applied

Per P21.01 (affordances and signifiers), P21.02 (the two gulfs), and P21.03 (slips vs
mistakes), every screen below specifies:
- **Signifiers**, not just layout — what tells the user an element is actionable
- **Execution clarity** — is the next action obvious?
- **Evaluation clarity** — does every action produce visible feedback?
- **Destructive action defence** — undo preferred over confirmation (P21.03)

Use the `frontend-design` skill guidance for visual tokens, spacing, and component styling.
Shadcn/ui components (DEC-008) are used throughout — no custom component library is built.

---

## 2. Screen: Public Registration Form

**Route:** `/register` (public, no auth)
**Maps to:** F1.01

**Layout:** Single column, single page, mobile-first (most participants will access this
from a phone, per Ghana mobile-first internet usage patterns, RES-004).

| Element | Signifier | Behaviour |
|---|---|---|
| Course dropdown | Standard select styling, placeholder "Select a course" | Populates from Active Batches (BR-19); shows `Course Name — Batch Label — Start Date` |
| Full Name, Email, Phone fields | Standard text inputs with labels above (not placeholder-only, per P21.04 — labels are knowledge in the world, not memory-dependent) | Inline validation on blur — red border + message appears immediately, not only on submit |
| Registration Source dropdown | Placeholder "How did you hear about us?" | Required |
| Consent checkbox | Checkbox + full consent text visible (not hidden behind a link) | Submit button is disabled (greyed out, not hidden) until checked — signifier: button opacity change communicates "not yet available" |
| Submit button | Solid primary color, label "Complete Registration" | On click: shows a loading spinner inside the button (execution feedback, P21.02); button disabled during submission to prevent double-submit |

**Gulf of Execution check:** Is the next action obvious? Yes — one button, clearly labelled,
disabled until the form is valid.

**Gulf of Evaluation check:** Does every action produce feedback? Yes — inline field
validation, button loading state, and a full-page confirmation message replacing the form on
success (per PRD F1.01).

**Duplicate registration state:** If BR-03 rejects the submission, the error message (Document
5, Section 2) appears as an inline banner above the form, in red, with the exact wording
specified in the PRD — the form remains filled in (does not clear) so the participant is not
forced to re-enter their details after an error they may not have expected.

**Destructive action:** None on this screen — no defence required.

---

## 3. Screen: Management Dashboard

**Route:** `/dashboard`
**Maps to:** F1.08. Default landing page for `admin` and `management` roles.
**Data source:** `GET /api/dashboard/summary`

**Layout:** Card grid, one card per active Batch, plus an aggregate summary bar at the top.

| Element | Signifier | Behaviour |
|---|---|---|
| Aggregate summary bar | Three large numbers: Registrations This Month, Revenue Received This Month, Total Outstanding | No interaction — pure read display, per role Stage 5 aha moment: "dashboard shows conversion rate at a glance" |
| Per-Batch card | Card with course name, batch label, and 4-color-coded stat row (registered/paid/unpaid/part-payment) | Clicking a card (Admin only) navigates to the filtered Registration List for that Batch. Management role: card is not clickable — cursor remains default, no hover state, signalling non-interactivity clearly rather than a dead click |
| Payment Conversion Rate | Large percentage figure per card, with a small up/down arrow if historical comparison data exists (Phase 3) | Colour: green if ≥ 70%, amber if 40–69%, red if < 40% — thresholds informed by RES-001 SaaS conversion benchmarks adapted to this context |
| Lead Source table | Simple table, sortable by count | Read-only |

**Gulf of Execution/Evaluation:** This is a read-only screen for Management — the "action" is
looking, and the "feedback" is the data itself being current and clearly labelled with a
"Last updated: just now" timestamp (since data is computed live per request, Document 3
Section 2) so the user trusts the freshness of what they see.

---

## 4. Screen: Registration List (Staff)

**Route:** `/registrations`
**Maps to:** F1.03. Roles: `admin`, `finance` (read), `marketing`.
**Data source:** `GET /api/registrations`

| Element | Signifier | Behaviour |
|---|---|---|
| Filter bar | Dropdowns for Course, Batch, Registration Status, Payment Status, Lead Source; date range picker; search box | Filters apply immediately on change (no separate "Apply" button) — this is a low-stakes, reversible action (P21.03) so immediate application is appropriate, unlike a destructive action |
| Data table | Shadcn `Table` component, sortable columns | Payment Status shown as a coloured badge (red=Unpaid, amber=Part Payment, green=Paid) — colour is a signifier reinforcing the status text, not a replacement for it (accessibility: never colour alone) |
| Notes field (inline editable) | Pencil icon appears on hover over the Notes cell | Click to edit inline; auto-saves on blur with a brief "Saved" toast confirmation (evaluation feedback) |
| Row click (Marketing role) | Cursor pointer on hover | Opens a detail drawer showing full registration + lead info (Phase 2: follow-up fields appear here) |

**Role-specific rendering:** Finance sees this list read-only (no inline edit on Notes);
their editable view is the Payment Tracking screen instead. Marketing sees Notes as editable.
This matches the API's role-based field-shaping (Document 5, Section 3) — the frontend does
not attempt to show fields the API does not return for that role.

---

## 5. Screen: Payment Tracking

**Route:** `/payments`
**Maps to:** F1.04. Role: `finance`, `admin`. Default landing page for `finance`.
**Data source:** `GET /api/registrations` (filtered), `PATCH /api/payments/[id]`

| Element | Signifier | Behaviour |
|---|---|---|
| Default filter | Pre-applied filter: Payment Status = Unpaid OR Part Payment, sorted by Batch Start Date ascending (soonest first) | This IS the Stage 5 aha moment design requirement — Finance logs in and immediately sees what needs action, zero navigation |
| Amount Paid input | Numeric input, GHS prefix shown | On blur, if value > 0 and < Course Fee, a small inline text appears: "This will be recorded as a Part Payment" — preview feedback before commit (Gulf of Evaluation, anticipatory) |
| Mark as Paid button | Prominent button, appears once Amount Paid ≥ Course Fee is entered | Confirmation dialog: "Confirm payment of GHS [x] for [Participant Name]? A confirmation email will be sent automatically." — this is a legitimate use of confirmation (not undo) because it triggers an irreversible external side effect (an email is sent) per P21.03's guidance that confirmation is acceptable for actions with real-world consequences beyond the database |
| Verified By | Greyed out, non-editable, shows "Auto-filled on save" placeholder before submission | After save: shows the Finance user's name — visible proof of the audit trail (BR-12) |
| Payment Method dropdown | Standard select | Required before Mark as Paid is enabled |
| Transaction ID field | Required only if Payment Method = Bank Transfer or MTN MoMo manual entry | Field is conditionally shown/required — reduces cognitive load by hiding irrelevant fields (P5.01 complexity reduction) |

**Post-save feedback:** Row briefly highlights green and the status badge updates from
amber/red to green in place — no full page reload, confirming the action's effect
immediately and specifically (Gulf of Evaluation).

---

## 6. Screen: Course Control Panel

**Route:** `/courses`
**Maps to:** F1.02. Role: `admin` only (others: read-only view, or hidden entirely per role
route table, Document 6 Section 3).

| Element | Signifier | Behaviour |
|---|---|---|
| Course list | Simple list/table of Courses with an "Add Course" button (primary color, plus icon) | Clicking a Course expands to show its Batches |
| Add Batch form | Modal or inline expansion form | All PRD F1.02 fields present; Start Date/End Date use a date picker (not free text) to prevent format-entry mistakes (P21.03 — defends against slips) |
| Active/Inactive toggle | Shadcn `Switch` component, clearly labelled "Active" | Toggling off shows an inline warning: "Turning this off will stop all automated emails for this batch immediately." This is informational, not a blocking confirmation — the action is reversible (can toggle back on), so a heavy confirmation dialog is unnecessary friction (P21.03 — match the defence to the actual reversibility) |
| Per-email-type toggles | Individual switches for Welcome/Payment Reminder/Class Reminder | Grouped visually under "Automation Settings" heading — signifies these are related, subordinate controls to the master Active toggle |
| Zoom Link / WhatsApp Link fields | Standard URL inputs with inline validation (must start with `https://`) | |

**Destructive action — deleting a Course:** Not exposed in the UI in Phase 1. Per Document 3
(`ON DELETE RESTRICT` on `batches.course_id`), a Course with existing Batches cannot be
deleted at the database level regardless. The UI does not offer a delete button for Courses
at all in Phase 1 — removing the affordance entirely is a stronger defence than a
confirmation dialog for an action that is both rare and consequential (P21.03, taken to its
logical conclusion: the best defence against a dangerous slip is removing the control).

---

## 7. Screen: My Courses (Tutor)

**Route:** `/my-courses`
**Maps to:** Tutor journey (Stage 5 Discovery). Role: `tutor` only. Default landing page.

| Element | Signifier | Behaviour |
|---|---|---|
| Course selector | Simple dropdown or tab list if the Tutor has more than one assigned Batch | Defaults to the soonest upcoming Batch |
| Confirmed Participant list | Clean table: Name, Email, Phone only — no payment columns exist in this view at all (not hidden via CSS, simply not present in the rendered component, matching the API's field-shaping for this role) | |
| Export/Print button | Standard button with printer icon | Triggers browser print dialog styled for a clean attendance sheet (print stylesheet hides navigation chrome) |

**Gulf of Execution:** Is it obvious what to do? Yes — one list, one export button, no
distractions. This directly satisfies the Stage 5 aha moment: "seeing a full, clean list of
confirmed participants before class," reached in the fewest possible steps.

---

## 8. Screen: Staff User Management

**Route:** `/users`
**Maps to:** US-A05. Role: `admin` only.

| Element | Signifier | Behaviour |
|---|---|---|
| Staff list | Table: Name, Email, Role (badge), Active status | |
| Add Staff button | Primary button | Opens a form: Full Name, Email, Role dropdown. On submit, triggers Supabase Auth invitation email (Document 5, Section 11) |
| Deactivate toggle | Switch per row | Confirmation dialog: "Deactivate [Name]? They will lose access immediately." — appropriate here because deactivation has an immediate, security-relevant effect on another person's access (distinct from the Batch Active toggle, which only affects automation, not human access) |

---

## 9. Global Navigation and Layout

**Sidebar navigation**, role-filtered — a role never sees a navigation link to a screen they
cannot access (not just a redirect if they try; the link itself is absent, reducing
confusion per P5.01 — do not force the user to discover a restriction by hitting it).

| Role | Visible nav items |
|---|---|
| admin | Dashboard, Registrations, Payments, Courses, Users |
| finance | Payments, Registrations (read) |
| marketing | Registrations, Follow-Up (Phase 2) |
| tutor | My Courses |
| management | Dashboard |

**Logout:** Always visible in the top-right corner across all roles, standard signifier
(user avatar/initials + dropdown).

---

## 10. Ready for Development Checklist

```
□ 1. All 7 staff-facing screens plus the public registration form specified
      above are built exactly as described, using Shadcn/ui components.
□ 2. Every screen's Gulf of Execution and Gulf of Evaluation checks (P21.02)
      satisfied — next action obvious, every action gives visible feedback.
□ 3. Destructive/consequential actions use the correct defence per action:
      confirmation for Mark as Paid (irreversible email side effect) and
      Deactivate Staff (immediate access change); informational warning
      (not blocking confirmation) for the reversible Batch Active toggle;
      affordance removal entirely for Course deletion.
□ 4. Role-based navigation hides inaccessible screens rather than showing
      them and blocking on click.
□ 5. Payment Status always shown with both colour AND text — never colour alone.
□ 6. Registration form retains entered data on a duplicate-registration
      error rather than clearing the form.
□ 7. Dashboard displays a "last updated" indicator since data is computed
      live, not cached.
□ 8. Next document to read: Document 9 — Test Specification.
```

---

*Document 9 of 12: Test Specification follows.*
