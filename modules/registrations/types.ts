import { z } from 'zod';

import { LEAD_SOURCES, REGISTRATION_STATUSES, SELF_DECLARED_LEAD_SOURCES } from '@/lib/domain/types';
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
  // Free event / webinar: the row settles to Paid at GHS 0 on registration, so
  // it is not a collections case and never belongs on the payments worklist.
  isFree: boolean;
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

// Professional-context fields — collected to help staff segment leads and
// follow up on corporate sponsorship. Required on the public form (founder
// decision, 2026-07-24): a registrant with no current job/company enters
// "N/A" rather than leaving the field blank.
const requiredProfessionalText = z.string().trim().min(1).max(150);

// Optional variant, kept for bulk import (staff backfill of historical
// registrations collected outside the system) where the source data may
// genuinely have this field blank. .nullish() (not .optional()) so an
// explicit null on the input is accepted too — the field is always stored
// as string | null downstream.
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
  jobTitle: requiredProfessionalText,
  company: requiredProfessionalText,
  batchId: z.uuid(),
  // Full set, so RegistrationInput can carry 'Returning' for the portal
  // enrolment path (modules/portal/service.ts's enrolInBatch), which builds this
  // input server-side from an authenticated participant's own stored record.
  // The PUBLIC route does not use this schema directly — see
  // publicRegistrationInputSchema below.
  leadSource: z.enum(LEAD_SOURCES),
  // BR-15: consent must be literally true; z.literal rejects everything else.
  consentGiven: z.boolean(),
  // Knowsia Growth Partner Programme (2026-08-02) — an explicit code always
  // wins over a tracked-link cookie (see registrationsService.createRegistration).
  couponCode: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .transform((value) => (value ? value.toUpperCase() : null)),
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

// One-click enrolment for a Participant who already has an account (BR-42,
// founder direction 2026-08-12: "those with an already existing account should
// not go through the same process of registering ... they only have to enrol on
// to the course they're interested in").
//
// batchId is the only field that really matters. The three profile fields exist
// solely for the minority of records — legacy imports, mostly — whose
// participant row predates a column a Registration needs. They are a top-up,
// never a re-collection: the service uses one only where its own record has a
// gap, and names anything still missing in a MISSING_PROFILE_FIELDS error so
// the caller can ask for those alone.
//
// There is no participantId here on purpose. Identity comes from the portal
// session at the route, never from the request body — otherwise this would be
// an endpoint for registering other people.
export const enrolExistingParticipantSchema = z.object({
  batchId: z.uuid(),
  // Same one-field-serves-both-systems behaviour as the public form: tried as a
  // partner code first, then as a standalone coupon. Omitting it is the norm.
  couponCode: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .transform((value) => (value ? value.toUpperCase() : null)),
  gender: z.enum(['Male', 'Female']).optional(),
  jobTitle: z.string().trim().min(1).max(150).optional(),
  company: z.string().trim().min(1).max(150).optional(),
});
export type EnrolExistingParticipantInput = z.infer<typeof enrolExistingParticipantSchema>;

// What POST /api/registrations accepts from an anonymous visitor (2026-08-12).
// Identical to the above except that 'Returning' is not selectable: that value
// is system-assigned by the portal enrolment path, where a portal session has
// already proven who the participant is. Letting the public form claim it would
// corrupt the one figure — repeat-enrolment rate — that the value exists to make
// countable, and it costs nothing to close since no legitimate caller needs it.
export const publicRegistrationInputSchema = registrationInputSchema.extend({
  leadSource: z.enum(SELF_DECLARED_LEAD_SOURCES),
});

export const registrationListFiltersSchema = z.object({
  courseId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  registrationStatus: z.enum(REGISTRATION_STATUSES).optional(),
  // Payment status lives on `payments`, which the list read joins AFTER
  // slicing the page. It used to be applied only in the service's post-join
  // pass, which filters a page that has already been cut — so on 2026-08-06
  // the 267 free ESG2 sign-ups filled the newest-200 window and left 8 of 35
  // outstanding balances visible. The repository now narrows the id set up
  // front and the post-join pass is the row-level guarantee.
  //
  // Any value added here must be handled in BOTH places — applyPostJoinFilters
  // compares with === and 'outstanding' matches no real payment_status, so
  // missing it there empties the screen instead of widening it.
  paymentStatus: z.enum(['outstanding', 'Unpaid', 'Part Payment', 'Paid']).optional(),
  // Full set — staff filter registrations they are READING back, and
  // 'Returning' is precisely the slice worth isolating.
  leadSource: z.enum(LEAD_SOURCES).optional(),
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

// Auto-lapse grace period (founder decision 2026-08-09: "15 days"), counted
// from the Batch's END date, not its start — the course has to be over before
// not showing up means anything.
export const AUTO_LAPSE_GRACE_DAYS = 15;

// The sentence written into lapsed_reason by the nightly sweep. lapsed_by is
// what actually distinguishes an automatic write-off from a staff member's
// (it is null for the sweep); this is here so the Registrations screen has
// something readable to show.
export const AUTO_LAPSE_REASON = `Automatically written off ${AUTO_LAPSE_GRACE_DAYS} days after the course ended: no payment received and no attendance recorded.`;

// Write-off (2026-08-09) — reason is mandatory, same audit-trail convention as
// manualDeletionRequestSchema below.
export const lapseRegistrationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type LapseRegistrationInput = z.infer<typeof lapseRegistrationSchema>;

export interface AutoLapseSweepSummary {
  // The first real run closes out the entire historic backlog at once, so the
  // manual trigger defaults to a dry run — see /api/cron/registrations/auto-lapse.
  dryRun: boolean;
  candidatesEvaluated: number;
  lapsed: number;
  skippedPartPayment: number;
  skippedAttended: number;
  errors: string[];
}

// Immediate hard-delete of wrongly-entered/test data (founder-approved
// 2026-07-22) — reason is mandatory for the audit trail, same convention as
// the DPA soft-delete request.
export const manualDeletionRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type ManualDeletionRequest = z.infer<typeof manualDeletionRequestSchema>;

// Batch/cohort transfer (system review, 2026-07-24) — admin-only, moves a
// Registration to a different Batch of the same Course. Reason is mandatory,
// same audit-trail convention as manualDeletionRequestSchema.
export const transferRegistrationSchema = z.object({
  newBatchId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type TransferRegistrationInput = z.infer<typeof transferRegistrationSchema>;

// Registration 360° view (system review, approved 2026-07-20). Sections
// beyond `registration`/`participant`/`payment` are omitted entirely (not
// present as empty arrays) when the viewing role isn't permitted to see
// them — see `shapeRegistration360ForRole` for exactly which role sees what.
export interface Registration360 {
  canDelete: boolean;
  // Admin + finance, and only while there is a balance left to write off
  // (2026-08-09) — computed server-side so the dialog can show the right
  // action without guessing; lapseRegistration re-checks both itself.
  canLapse: boolean;
  registration: {
    id: string;
    registrationStatus: RegistrationStatus;
    leadSource: LeadSource;
    notes: string | null;
    registeredAt: string;
    lapsedAt: string | null;
    lapsedByName: string | null;
    lapsedReason: string | null;
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
    // courseId/batchId (system review, 2026-07-24) — needed by the staff UI
    // to look up sibling Batches of the same Course for the transfer action.
    courseId: string;
    batchId: string;
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
    // Payment plan (founder-approved 2026-07-24) — empty when none exists.
    // Same visibility rule as the rest of this payment object (admin/finance).
    installments?: Array<{
      installmentNumber: number;
      amountDue: number;
      amountPaid: number;
      dueDate: string;
      paymentStatus: 'Pending' | 'Paid';
    }>;
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
    relevanceRating: number;
    facilitatorRating: number;
    confidenceRating: number;
    materialsClarity: 'Yes' | 'Partly' | 'No';
    mostValuableText: string | null;
    improvementText: string | null;
    recommendation: 'Yes' | 'Maybe' | 'No';
    otherCourseSuggestion: string | null;
    testimonialChoice: 'Named' | 'Anonymous' | 'No';
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

// Discriminated on `outcome` (waitlist feature, founder-approved
// 2026-07-24): a Batch at capacity yields a waitlist entry instead of a
// Registration — same public endpoint, same input, a different result
// shape the client branches on.
export type CreateRegistrationResult =
  | {
      outcome: 'registered';
      registrationId: string;
      registrationStatus: RegistrationStatus;
      paymentStatus: PaymentStatus;
      message: string;
      // Actual fee locked in for this registration (Knowsia Growth Partner
      // Programme, 2026-08-02) — may be lower than the batch's listed fee if
      // a coupon code discount beat the early-bird price. The client must
      // charge this amount, not re-derive it from the batch.
      courseFee: number;
    }
  | {
      outcome: 'waitlisted';
      waitlistId: string;
      message: string;
    };

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
  // Self-declared: a staff member picks this for a backfilled row, so the same
  // "never claim Returning on someone's behalf" rule as the public form applies.
  leadSource: z.enum(SELF_DECLARED_LEAD_SOURCES).default('Other'),
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
