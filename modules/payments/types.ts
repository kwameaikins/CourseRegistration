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
