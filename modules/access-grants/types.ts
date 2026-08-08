import { z } from 'zod';

// Why an unsettled registration was let in. 'part_payment' is the only one
// the system ever grants on its own; the other two are staff judgement.
export const ACCESS_GRANT_REASONS = ['part_payment', 'credit', 'goodwill'] as const;
export type AccessGrantReason = (typeof ACCESS_GRANT_REASONS)[number];

// Default window, founder-set 2026-08-08. Short on purpose: a grant is an
// unsecured debt, and five days is long enough to attend the next couple of
// sessions while still forcing the conversation back around quickly.
// Extensions are cheap (one more row) — a long default is not.
export const DEFAULT_ACCESS_GRANT_DAYS = 5;

// The most access finance can hand out on one registration without an admin,
// measured as total span from the FIRST grant, not per-grant — otherwise
// five 5-day extensions quietly become open-ended credit.
export const FINANCE_MAX_CUMULATIVE_ACCESS_DAYS = 21;

// How much of the fee must have landed before access opens automatically.
// Below this it stays a manual decision.
export const AUTO_GRANT_MIN_PAID_FRACTION = 0.5;

// Lead time on the "your access ends soon" warning.
export const ACCESS_EXPIRY_WARNING_LEAD_DAYS = 3;

export interface AccessGrant {
  id: string;
  registrationId: string;
  reason: AccessGrantReason;
  expiresOn: string; // inclusive YYYY-MM-DD
  note: string;
  grantedByName: string | null; // null = granted automatically by the system
  grantedAt: string;
  revokedAt: string | null;
}

// What the gates actually need: is this registration allowed in right now,
// and until when. `until` is null when access comes from a settled balance
// (permanent) rather than a grant.
export interface AccessState {
  hasAccess: boolean;
  until: string | null;
  reason: AccessGrantReason | null;
}

export const grantAccessInputSchema = z.object({
  reason: z.enum(ACCESS_GRANT_REASONS),
  // Either an explicit end date or a number of days from today. Days is what
  // the UI sends (prefilled with DEFAULT_ACCESS_GRANT_DAYS); an explicit date
  // exists for "let them in until the course ends" cases.
  days: z.coerce.number().int().positive().max(365).optional(),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().trim().min(3).max(500),
});

export type GrantAccessInput = z.infer<typeof grantAccessInputSchema>;

export const revokeAccessInputSchema = z.object({
  note: z.string().trim().min(3).max(500),
});

export type RevokeAccessInput = z.infer<typeof revokeAccessInputSchema>;

export interface AccessSweepSummary {
  expiredEvaluated: number;
  accessWithdrawn: number;
  zoomRevoked: number;
  warningsSent: number;
  expiryNoticesSent: number;
  errors: string[];
}
