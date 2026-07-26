import { z } from 'zod';

import { bulkImportRowSchema } from '@/modules/registrations/types';
import type { PaymentStatus } from '@/lib/domain/types';

export interface Company {
  id: string;
  name: string;
  tin: string | null;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  billingAddress: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createCompanyInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  tin: z.string().trim().max(50).nullish(),
  billingContactName: z.string().trim().min(1).max(200),
  billingEmail: z.email().transform((value) => value.toLowerCase()),
  billingPhone: z.string().trim().min(10),
  billingAddress: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export type CreateCompanyInput = z.infer<typeof createCompanyInputSchema>;

export const ALLOCATION_STATUSES = ['active', 'completed', 'cancelled'] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export interface CompanyBatchAllocation {
  id: string;
  companyId: string;
  batchId: string;
  seatsPurchased: number;
  pricePerSeat: number;
  status: AllocationStatus;
  statusReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Rolled-up view (Phase 1 "Invoice" replacement) — seatsUsed/amountInvoiced/
// amountSettled are always computed live from linked registrations/payments,
// never stored, so they can never drift from the source of truth.
export interface CompanyAllocationDetail extends CompanyBatchAllocation {
  companyName: string;
  batchCohortLabel: string;
  batchStartDate: string;
  courseName: string;
  seatsUsed: number;
  seatsRemaining: number;
  amountInvoiced: number;
  amountSettled: number;
  employees: Array<{
    registrationId: string;
    fullName: string;
    email: string;
    phone: string;
    paymentStatus: PaymentStatus;
    amountPaid: number;
    courseFee: number;
    registeredAt: string;
  }>;
}

export const createSeatAllocationInputSchema = z.object({
  companyId: z.uuid(),
  batchId: z.uuid(),
  seatsPurchased: z.coerce.number().int().positive(),
  pricePerSeat: z.coerce.number().min(0),
  notes: z.string().trim().max(2000).nullish(),
});

export type CreateSeatAllocationInput = z.infer<typeof createSeatAllocationInputSchema>;

export const updateAllocationStatusInputSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
  reason: z.string().trim().min(3).max(500),
});

export type UpdateAllocationStatusInput = z.infer<typeof updateAllocationStatusInputSchema>;

// Reuses the exact same per-row shape as staff bulk import (BulkImportRow) —
// an employee row needs the same fields (name/gender/email/phone/jobTitle/
// company/amountPaid/courseFee override).
export const addEmployeesInputSchema = z.object({
  leadSource: z
    .enum(['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other'])
    .default('Other'),
  paymentMethod: z.enum(['Bank Transfer', 'Cash', 'Other']).default('Bank Transfer'),
  rows: z.array(bulkImportRowSchema).min(1).max(300),
});

export type AddEmployeesInput = z.infer<typeof addEmployeesInputSchema>;

export interface AddEmployeesRowResult {
  index: number;
  email: string;
  status: 'created' | 'duplicate' | 'error' | 'seats_exhausted';
  message?: string;
}

export interface AddEmployeesResult {
  results: AddEmployeesRowResult[];
  summary: { created: number; duplicates: number; errors: number };
}

// Company portal auth (Phase 2) — mirrors modules/portal/types.ts's
// participant PIN/session shapes exactly, scoped to a company instead.
export const COMPANY_PORTAL_SESSION_COOKIE = 'company_portal_session';

export const companyPortalLoginSchema = z.object({
  billingEmail: z.string().trim().min(3).max(200),
  pin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
});
export type CompanyPortalLoginInput = z.infer<typeof companyPortalLoginSchema>;

export const companyPortalChangePinSchema = z
  .object({
    currentPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
    newPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
  })
  .refine((input) => input.currentPin !== input.newPin, {
    message: 'Choose a different PIN than your current one.',
    path: ['newPin'],
  });
export type CompanyPortalChangePinInput = z.infer<typeof companyPortalChangePinSchema>;

export type CompanyPortalLoginResult =
  | { status: 'ok'; sessionId: string; expiresAt: string; mustChangePin: boolean }
  | { status: 'invalid' }
  | { status: 'locked' };

export interface CompanyPortalDashboard {
  companyName: string;
  billingContactName: string;
  billingEmail: string;
  mustChangePin: boolean;
  allocations: CompanyAllocationDetail[];
}
