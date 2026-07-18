# Centralised Course Registration & Follow-Up System
## Coding Standards and Conventions

---

| Field | Value |
|---|---|
| **Document** | Coding Standards and Conventions |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | AI Coding Agent |
| **Input from** | Document 2 (Technical Architecture) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Initial standards |

---

## Table of Contents

1. [Naming Conventions](#1-naming-conventions)
2. [TypeScript Conventions](#2-typescript-conventions)
3. [File Organisation Rules](#3-file-organisation-rules)
4. [Module Boundary Enforcement](#4-module-boundary-enforcement)
5. [Comment Standards](#5-comment-standards)
6. [Error Handling Convention](#6-error-handling-convention)
7. [Git Conventions](#7-git-conventions)
8. [Dependency Management](#8-dependency-management)
9. [Ready for Development Checklist](#9-ready-for-development-checklist)

---

## 1. Naming Conventions

Per P17.01 (ubiquitous language) — code identifiers use the exact terms from Document 1,
Section 3's glossary, not synonyms.

| Element | Convention | Example |
|---|---|---|
| Database tables/columns | `snake_case`, matches PRD glossary terms exactly | `registration_status`, not `reg_state` or `status` |
| TypeScript types/interfaces | `PascalCase`, singular, matches glossary term | `Registration`, `Participant`, `PaymentStatus` (as a union type, not `Status`) |
| TypeScript variables/functions | `camelCase` | `createRegistration()`, `paymentStatus` |
| React components | `PascalCase`, descriptive of the screen/purpose | `PaymentTrackingTable`, `RegistrationForm` |
| API route files | Match the route path | `app/api/registrations/route.ts` |
| Module folders | Match the module name from Document 2, Section 4 | `modules/registrations/`, `modules/payments/` |
| Environment variables | `SCREAMING_SNAKE_CASE` | `SUPABASE_SERVICE_ROLE_KEY` |

**Forbidden:** Generic names that lose the domain meaning — `data`, `item`, `handleClick`,
`temp`. Every identifier should be understandable by someone who has only read Document 1's
glossary, without needing to trace through the code to guess what it means (P5.08 — code
should be obvious).

---

## 2. TypeScript Conventions

- `strict: true` in `tsconfig.json` — no exceptions.
- No `any` type without an inline comment explaining why it is unavoidable (should be
  extremely rare in this codebase — Supabase generates types from the schema, and Zod
  schemas provide validated types for all API boundaries).
- Supabase types are generated via `supabase gen types typescript` after every migration
  change and committed to `lib/supabase/database.types.ts` — never hand-written.
- Every `modules/*/types.ts` file defines the domain types matching the glossary (Document
  1, Section 3) — e.g. `Registration`, `Payment`, `Batch` — which are then used throughout
  that module's `service.ts` and `repository.ts`, rather than passing raw Supabase row types
  around the application.

```typescript
// Correct: domain type matches glossary
interface Registration {
  id: string;
  participantId: string;
  batchId: string;
  registrationStatus: 'Registered' | 'Confirmed' | 'Attended' | 'Cancelled';
  leadSource: 'WhatsApp' | 'Facebook' | 'LinkedIn' | 'Referral' | 'Website' | 'Other';
  registeredAt: string;
}
```

---

## 3. File Organisation Rules

Matches Document 2, Section 3 exactly. Restated as enforceable rules:

1. No file inside `app/` (pages or API routes) contains a `supabase.from(...)` call
   directly — every database interaction goes through a `modules/*/repository.ts` function.
2. No file inside `modules/*/repository.ts` contains business logic (conditionals that
   implement a Business Rule from Document 4) — repository files are pure data access.
   Business rules live in `modules/*/service.ts`.
3. Shared, cross-cutting code (Supabase clients, Paystack client, Resend client) lives in
   `lib/`, never duplicated inside a module folder.
4. One file, one responsibility — a `service.ts` file exceeding roughly 300 lines is a
   signal to split it by sub-concern (e.g. `payments/service.ts` could split into
   `payment-status.service.ts` and `payment-webhook.service.ts` if it grows), per P5.01
   (complexity from file size affecting comprehension).

---

## 4. Module Boundary Enforcement

Per P6.01 (the dependency rule) and Document 2, Section 11:

```
app/  →  modules/*/service.ts  →  modules/*/repository.ts  →  lib/supabase
```

**Self-check before considering any file complete:** Does this file import anything that
violates the arrow direction above? Specifically:
- Does a `repository.ts` file import from another module's `repository.ts`? **Forbidden** —
  route cross-module reads through the other module's exposed service function instead
  (Document 2, Section 4).
- Does an `app/` page component construct a Supabase query directly? **Forbidden** — call
  the relevant `service.ts` function (via a Server Action or API route).

**The one documented exception:** every module may call
`modules/communications/service.ts` to send an email (Document 2, Section 9) — this is the
generic-subdomain exception stated explicitly, not an undocumented shortcut.

---

## 5. Comment Standards

Per P5.06 — comments document the why, not the what.

```typescript
// WRONG — restates the code, adds no information
// Set payment status to paid
payment.status = 'Paid';

// RIGHT — explains a non-obvious constraint from the Business Rules document
// payment_status is never set directly here — it is derived by a database
// trigger (BR-04, Document 4) from amount_paid. This assignment exists only
// in the TypeScript return type for the API response shape, not as a write.
```

Every reference to a Business Rule (BR-XX) or Edge Case (EC-XX) from Document 4 in code
should cite the rule ID in a comment, so a future maintainer (human or AI agent) can trace
the code back to its specification without guessing intent.

---

## 6. Error Handling Convention

Matches the Error Response Standard (Document 5, Section 12).

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(public code: string, message: string, public httpStatus: number) {
    super(message);
  }
}

// Usage in a service function
if (existingRegistration) {
  throw new AppError('DUPLICATE_REGISTRATION',
    'You are already registered for this course intake. If you need help, please contact us.',
    409);
}

// Usage in an API route — single catch pattern applied consistently
export async function POST(request: Request) {
  try {
    const result = await registrationService.create(await request.json());
    return Response.json({ data: result, error: null }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ data: null, error: { code: err.code, message: err.message } }, { status: err.httpStatus });
    }
    Sentry.captureException(err);
    return Response.json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }, { status: 500 });
  }
}
```

Every API route follows this exact try/catch shape — no route has a bespoke error handling
pattern, ensuring consistency (P5.07 — consistency reduces cognitive load).

---

## 7. Git Conventions

| Rule | Detail |
|---|---|
| Commit message format | `[module] short description` — e.g. `[payments] add Paystack webhook signature validation (BR-13)` |
| Branch strategy | `main` is production (auto-deploys via Vercel). Feature branches per week's work: `week-1-foundation`, `week-2-payments`, etc., matching Document 10's plan |
| `.gitignore` | Must include `.env.local`, `.env`, `node_modules`, `.next` from the very first commit (Document 6, Section 5) |
| No secrets in history | If a secret is ever committed, it is rotated immediately (Document 6, Section 5) — `git filter-branch` alone does not fully mitigate an already-exposed key |

---

## 8. Dependency Management

- `npm audit` run before every deployment to production; any `high` or `critical`
  vulnerability is resolved before deploying (OWASP A06, Document 6 Section 8).
- Shadcn/ui components are copied into `components/ui/` via the Shadcn CLI, not installed
  as an npm package — this means dependency updates for UI components are manual and
  deliberate (DEC-008 rationale, Document 2), not automatic.
- No dependency is added to `package.json` without a specific need traceable to a feature in
  Document 1 — avoid speculative libraries "in case they're useful later" (P11.02 — via
  negativa; PX.02 — complexity is the enemy).

---

## 9. Ready for Development Checklist

```
□ 1. All naming conventions match the Document 1 glossary exactly —
      no renamed or abbreviated domain terms anywhere in the codebase.
□ 2. TypeScript strict mode enabled; Supabase types generated, not
      hand-written.
□ 3. File organisation matches Document 2, Section 3 exactly; module
      boundary rules (Section 4 above) self-checked on every file.
□ 4. Comments cite Business Rule IDs (BR-XX) where relevant, per Section 5.
□ 5. Error handling follows the single AppError + try/catch pattern
      consistently across every API route.
□ 6. Git conventions followed from the first commit, including .gitignore.
□ 7. No speculative dependencies added.
□ 8. Next document to read: Document 12 — Agent Prompt Engineering Guide.
```

---

*Document 12 of 12: Agent Prompt Engineering Guide follows — the final document.*
