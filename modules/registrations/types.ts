import { z } from 'zod';

import type {
  Gender,
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
  jobTitle: string | null;
  company: string | null;
  gender: Gender | null;
}

// One row of the staff Registration List (F1.03), joined across the
// aggregate. Payment audit fields are optional — they are stripped for the
// Marketing role at the API layer (Document 5, Section 3).
export interface RegistrationListRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string | null;
  company: string | null;
  gender: Gender | null;
  courseName: string;
  courseCode: string;
  cohortLabel: string;
  batchId: string;
  leadSource: LeadSource;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  courseFee: number;
  // Pre-discount fee snapshot; null when no staff discount has ever been
  // granted (courseFee IS the original fee in that case).
  originalFee: number | null;
  amountPaid: number;
  balance: number;
  registeredAt: string;
  notes: string | null;
  paymentMethod?: string | null;
  paymentNotes?: string | null;
  transactionId?: string | null;
  verifiedBy?: string | null;
}

// Optional professional-context fields — collected to help staff segment
// leads and follow up on corporate sponsorship, never required to register.
// .nullish() (not .optional()) so an explicit null on the input is accepted
// too — the field is always stored as string | null downstream.
const optionalProfessionalText = z
  .string()
  .trim()
  .max(150)
  .nullish()
  .transform((value) => (value ? value : null));

export const registrationInputSchema = z.object({
  firstName: z.string().trim().min(1),
  middleName: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((value) => (value ? value : null)),
  surname: z.string().trim().min(1),
  gender: z.enum(['Male', 'Female']),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(10),
  jobTitle: optionalProfessionalText,
  company: optionalProfessionalText,
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

// Registration 360° view (system review, approved 2026-07-20). Sections
// beyond `registration`/`participant`/`payment` are omitted entirely (not
// present as empty arrays) when the viewing role isn't permitted to see
// them — see `shapeRegistration360ForRole` for exactly which role sees what.
export interface Registration360 {
  registration: {
    id: string;
    registrationStatus: RegistrationStatus;
    leadSource: LeadSource;
    notes: string | null;
    registeredAt: string;
  };
  participant: {
    fullName: string;
    email: string;
    phone: string;
    jobTitle: string | null;
    company: string | null;
    gender: Gender | null;
    deleted: boolean;
  } | null;
  course: {
    courseName: string;
    courseCode: string;
    cohortLabel: string;
    startDate: string;
    endDate: string;
    facilitatorName: string;
  } | null;
  payment: {
    paymentStatus: PaymentStatus;
    courseFee: number;
    amountPaid: number;
    balance: number;
    paymentMethod?: string | null;
    transactionId?: string | null;
    paymentNotes?: string | null;
    verifiedBy?: string | null;
    paymentDate?: string | null;
    originalFee?: number | null;
    discountAmount?: number;
    discountReason?: string | null;
    discountGrantedByName?: string | null;
    discountGrantedAt?: string | null;
  } | null;
  messages?: {
    email: Array<{ type: string; sentAt: string; success: boolean; error: string | null }>;
    whatsapp: Array<{ type: string; sentAt: string; success: boolean; error: string | null }>;
    sms: Array<{ type: string; sentAt: string; success: boolean; error: string | null }>;
  };
  zoom?: { joinUrl: string; registeredAt: string } | null;
  attendance?: Array<{
    sessionDate: string;
    joinTime: string | null;
    leaveTime: string | null;
    durationMinutes: number;
  }>;
  feedback?: {
    overallRating: number;
    facilitatorRating: number;
    recommendRating: number;
    improvementText: string | null;
    testimonialConsent: boolean;
    submittedAt: string;
  } | null;
  certificates?: Array<{
    id: string;
    certificateNumber: string;
    issuedDate: string;
    revoked: boolean;
  }>;
  calls?: Array<{
    id: string;
    callType: string;
    status: string;
    summary: string | null;
    needsHumanFollowup: boolean;
    createdAt: string;
  }>;
}

export interface CreateRegistrationResult {
  registrationId: string;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  message: string;
}

// Bulk import (staff backfill of registrations collected outside the
// system, e.g. a Google Form) — one Batch, one Payment Method, one Lead
// Source for the whole run; per-row amountPaid drives each row's payment.
export const bulkImportRowSchema = z.object({
  firstName: z.string().trim().min(1),
  middleName: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((value) => (value ? value : null)),
  surname: z.string().trim().min(1),
  gender: z.enum(['Male', 'Female']),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(10),
  jobTitle: optionalProfessionalText,
  company: optionalProfessionalText,
  amountPaid: z.coerce.number().min(0).default(0),
  // Backfilled rows are imported long after a batch's discount cutoff has
  // passed, so the fee that would normally be auto-derived from today's
  // date is wrong for anyone who actually paid the early-bird price at the
  // time they originally registered. Optional per-row override; falls back
  // to the batch's current effective fee when omitted.
  courseFee: z.coerce.number().min(0).optional(),
});

export type BulkImportRow = z.infer<typeof bulkImportRowSchema>;

export const bulkImportRequestSchema = z.object({
  batchId: z.uuid(),
  leadSource: z
    .enum(['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other'])
    .default('Other'),
  paymentMethod: z.enum(['Paystack Card', 'MTN MoMo', 'Bank Transfer', 'Cash', 'Other']),
  notesSuffix: z.string().trim().max(200).nullish(),
  // Staff-facing confirmation that consent was already captured on the
  // original form — mirrors BR-15's server-side consent enforcement, just
  // attested once for the whole run instead of per public-form submission.
  consentConfirmed: z.literal(true),
  rows: z.array(bulkImportRowSchema).min(1).max(300),
});

export type BulkImportRequest = z.infer<typeof bulkImportRequestSchema>;

export interface BulkImportRowResult {
  index: number;
  email: string;
  status: 'created' | 'duplicate' | 'error';
  message?: string;
  paymentStatus?: PaymentStatus;
}

export interface BulkImportResult {
  results: BulkImportRowResult[];
  summary: {
    created: number;
    duplicates: number;
    errors: number;
    paid: number;
    unpaid: number;
  };
}
