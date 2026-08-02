import { z } from 'zod';

import type { PaymentMethod, PaymentStatus } from '@/lib/domain/types';

export interface Payment {
  id: string;
  registrationId: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  transactionId: string | null;
  paymentDate: string | null;
  verifiedBy: string | null;
  paymentNotes: string | null;
}

// BR-04: the client sends amountPaid and metadata only. paymentStatus and
// verifiedBy are intentionally absent — if a client sends them anyway, the
// route strips them before validation and logs a warning (client bug, not a
// security issue: the trigger and BR-12 override them regardless).
export const paymentUpdateSchema = z.object({
  amountPaid: z.number().min(0),
  paymentMethod: z.enum(['Paystack Card', 'MTN MoMo', 'Bank Transfer', 'Cash', 'Other']),
  transactionId: z.string().trim().max(100).nullable().optional(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  paymentNotes: z.string().trim().max(2000).nullable().optional(),
});

export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;

// Staff-granted discretionary discount / fee waiver (founder-approved
// 2026-07-22). This only supports granting MORE discount on top of any
// already granted — no product requirement asked for reversing a discount,
// so undo is intentionally out of scope for this pass.
export const paymentDiscountSchema = z.object({
  discountAmount: z.number().positive(),
  reason: z.string().trim().min(3).max(500),
});

export type PaymentDiscountInput = z.infer<typeof paymentDiscountSchema>;

// Paystack charge.success payload — shape validated before any field is read
// (Document 6, Section 7).
export const paystackWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    amount: z.number(), // pesewas/kobo — divide by 100 for GHS
    channel: z.string().optional(),
    customer: z.object({ email: z.string().optional() }).optional(),
    metadata: z
      .object({ registration_id: z.string().optional() })
      .nullable()
      .optional(),
  }),
});

export type PaystackWebhookPayload = z.infer<typeof paystackWebhookSchema>;

export type WebhookOutcome =
  | { status: 'already_processed' }
  | { status: 'unmatched_logged_for_review' }
  | { status: 'ignored_event' }
  | { status: 'processed'; paymentStatus: PaymentStatus };

// Simple fixed-split payment plan (founder-approved 2026-07-24: "simple
// fixed split," not fully flexible schedules) — one row per installment,
// reconciled from the parent Payment's amount_paid (see
// reconcileInstallments in service.ts). The parent payments row remains the
// sole source of truth for BR-04/BR-05/BR-06; these rows are a schedule/
// progress view layered on top, not a second ledger.
export interface Installment {
  id: string;
  installmentNumber: number;
  amountDue: number;
  amountPaid: number;
  dueDate: string;
  paymentStatus: 'Pending' | 'Paid';
  paidAt: string | null;
}

// Self-service payment submission (founder-requested 2026-08-01) — a
// registrant's claimed MoMo/bank-transfer payment, awaiting finance/admin
// review before it's applied to `payments` via the existing
// applyPaymentUpdate (BR-04/05/06/12 all stay intact; this table never
// writes payment_status/verified_by itself).
export const PAYMENT_SUBMISSION_METHODS = ['MTN MoMo', 'Bank Transfer'] as const;
export type PaymentSubmissionMethod = (typeof PAYMENT_SUBMISSION_METHODS)[number];

export const PAYMENT_SUBMISSION_SLIP_MAX_BYTES = 5 * 1024 * 1024;
export const PAYMENT_SUBMISSION_SLIP_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export const paymentSubmissionInputSchema = z.object({
  registrationId: z.uuid(),
  method: z.enum(PAYMENT_SUBMISSION_METHODS),
  amount: z.coerce.number().positive(),
  transactionReference: z.string().trim().max(100).nullable().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participantNotes: z.string().trim().max(1000).nullable().optional(),
});
export type PaymentSubmissionInput = z.infer<typeof paymentSubmissionInputSchema>;

export const paymentSubmissionReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  overrideAmountPaid: z.number().positive().optional(),
  overrideTransactionId: z.string().trim().max(100).optional(),
  overridePaymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reviewNote: z.string().trim().max(1000).optional(),
});
export type PaymentSubmissionReviewInput = z.infer<typeof paymentSubmissionReviewSchema>;

export interface PaymentSubmission {
  id: string;
  registrationId: string;
  method: PaymentSubmissionMethod;
  amount: number;
  transactionReference: string | null;
  paymentDate: string;
  hasSlip: boolean; // the raw storage path is never sent to any client
  participantNotes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

// Staff queue view — adds participant/course context the bare row lacks.
export interface PaymentSubmissionView extends PaymentSubmission {
  participantName: string;
  courseName: string;
  cohortLabel: string;
}
