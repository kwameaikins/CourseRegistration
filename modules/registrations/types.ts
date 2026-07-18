import { z } from 'zod';

import type {
  LeadSource,
  PaymentStatus,
  RegistrationStatus,
} from '@/lib/domain/types';

export interface Registration {
  id: string;
  participantId: string;
  batchId: string;
  registrationStatus: RegistrationStatus;
  leadSource: LeadSource;
  consentGiven: boolean;
  notes: string | null;
  registeredAt: string;
}

export interface Participant {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

// One row of the staff Registration List (F1.03), joined across the
// aggregate. Payment audit fields are optional — they are stripped for the
// Marketing role at the API layer (Document 5, Section 3).
export interface RegistrationListRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  courseName: string;
  courseCode: string;
  cohortLabel: string;
  batchId: string;
  leadSource: LeadSource;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  courseFee: number;
  amountPaid: number;
  balance: number;
  registeredAt: string;
  notes: string | null;
  paymentMethod?: string | null;
  paymentNotes?: string | null;
  transactionId?: string | null;
  verifiedBy?: string | null;
}

export const registrationInputSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(10),
  batchId: z.uuid(),
  leadSource: z.enum(['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other']),
  // BR-15: consent must be literally true; z.literal rejects everything else.
  consentGiven: z.boolean(),
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

export const registrationListFiltersSchema = z.object({
  courseId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  registrationStatus: z
    .enum(['Registered', 'Confirmed', 'Attended', 'Cancelled'])
    .optional(),
  paymentStatus: z.enum(['Unpaid', 'Part Payment', 'Paid']).optional(),
  leadSource: z
    .enum(['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other'])
    .optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type RegistrationListFilters = z.infer<typeof registrationListFiltersSchema>;

export interface CreateRegistrationResult {
  registrationId: string;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  message: string;
}
