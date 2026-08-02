import { z } from 'zod';

// Knowsia Growth Partner Programme (founder-requested 2026-08-02, per
// Coding Docs/knowsia_growth_partner_programme.md). One `codes` table
// serves both coupon-discount and partner-attribution duty — see the
// migration header for why.

export const PARTNER_CATEGORIES = ['ambassador', 'tutor', 'institutional', 'strategic'] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export const PARTNER_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export interface Partner {
  id: string;
  category: PartnerCategory;
  fullName: string;
  email: string | null;
  phone: string;
  companyName: string | null;
  tutorId: string | null;
  participantId: string | null;
  commissionRate: number | null;
  payoutMethod: 'MTN MoMo' | 'Bank Transfer' | null;
  payoutDetails: string | null;
  status: PartnerStatus;
  socialLinks: string | null;
  professionalBackground: string | null;
  promotionalMethods: string | null;
  estimatedAudienceSize: string | null;
  agreedToCodeOfConduct: boolean;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Public application form — restricted to the two self-serve categories
// (doc SS5/SS2: tutors get affiliate capability automatically through their
// existing account, strategic deals are negotiated, neither is "applied for").
export const partnerApplicationSchema = z.object({
  category: z.enum(['ambassador', 'institutional']),
  fullName: z.string().trim().min(2).max(200),
  email: z.email().transform((value) => value.toLowerCase()).nullish(),
  phone: z.string().trim().min(10),
  companyName: z.string().trim().max(200).nullish(),
  socialLinks: z.string().trim().max(2000).nullish(),
  professionalBackground: z.string().trim().max(2000).nullish(),
  promotionalMethods: z.string().trim().max(2000).nullish(),
  estimatedAudienceSize: z.string().trim().max(200).nullish(),
  payoutMethod: z.enum(['MTN MoMo', 'Bank Transfer']).nullish(),
  payoutDetails: z.string().trim().max(500).nullish(),
  agreedToCodeOfConduct: z.literal(true),
});
export type PartnerApplicationInput = z.infer<typeof partnerApplicationSchema>;

// Staff-direct creation (tutor/strategic, or any category staff wants to
// add without going through the application flow) — status starts 'active'
// immediately, no review step.
export const createPartnerInputSchema = z.object({
  category: z.enum(PARTNER_CATEGORIES),
  fullName: z.string().trim().min(2).max(200),
  email: z.email().transform((value) => value.toLowerCase()).nullish(),
  phone: z.string().trim().min(10),
  companyName: z.string().trim().max(200).nullish(),
  tutorId: z.uuid().nullish(),
  commissionRate: z.coerce.number().positive().max(100).nullish(),
  payoutMethod: z.enum(['MTN MoMo', 'Bank Transfer']).nullish(),
  payoutDetails: z.string().trim().max(500).nullish(),
});
export type CreatePartnerInput = z.infer<typeof createPartnerInputSchema>;

export const updatePartnerInputSchema = createPartnerInputSchema.partial();
export type UpdatePartnerInput = z.infer<typeof updatePartnerInputSchema>;

export const PARTNER_SESSION_COOKIE = 'partner_portal_session';

// Tracked-link cookie (app/r/[code]/route.ts) — 30-day attribution window,
// per the doc's priority order (an explicit code typed at registration
// always beats this cookie; see modules/registrations/service.ts).
export const REFERRAL_CODE_COOKIE = 'knowsia_ref_code';
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const partnerPortalLoginSchema = z.object({
  phone: z.string().trim().min(10),
  pin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
});
export type PartnerPortalLoginInput = z.infer<typeof partnerPortalLoginSchema>;

export const partnerPortalChangePinSchema = z
  .object({
    currentPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
    newPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
  })
  .refine((input) => input.currentPin !== input.newPin, {
    message: 'Choose a different PIN than your current one.',
    path: ['newPin'],
  });
export type PartnerPortalChangePinInput = z.infer<typeof partnerPortalChangePinSchema>;

export type PartnerPortalLoginResult =
  | { status: 'ok'; sessionId: string; expiresAt: string; mustChangePin: boolean }
  | { status: 'invalid' }
  | { status: 'locked' };

// --- Codes ---

export const CODE_DISCOUNT_TYPES = ['percentage', 'fixed_amount'] as const;
export type CodeDiscountType = (typeof CODE_DISCOUNT_TYPES)[number];

export interface Code {
  id: string;
  code: string;
  partnerId: string | null;
  discountType: CodeDiscountType | null;
  discountValue: number | null;
  appliesToCourseId: string | null;
  maxUses: number | null;
  usesCount: number;
  onePerParticipant: boolean;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export const createCodeInputSchema = z
  .object({
    code: z.string().trim().min(3).max(30),
    partnerId: z.uuid().nullish(),
    discountType: z.enum(CODE_DISCOUNT_TYPES).nullish(),
    discountValue: z.coerce.number().positive().nullish(),
    appliesToCourseId: z.uuid().nullish(),
    maxUses: z.coerce.number().int().positive().nullish(),
    onePerParticipant: z.boolean().default(true),
    expiresAt: z.string().nullish(),
  })
  .refine((input) => input.partnerId != null || input.discountType != null, {
    message: 'A code must either be linked to a partner or carry a discount (or both).',
    path: ['partnerId'],
  })
  .refine((input) => (input.discountType == null) === (input.discountValue == null), {
    message: 'Discount type and value must be set together.',
    path: ['discountValue'],
  });
export type CreateCodeInput = z.infer<typeof createCodeInputSchema>;

export interface CodePreview {
  valid: boolean;
  discountType: CodeDiscountType | null;
  discountValue: number | null;
  partnerId: string | null;
  reason?: string;
}

// --- Redemptions, commissions, payouts ---

export const ATTRIBUTION_METHODS = ['code', 'link', 'manual'] as const;
export type AttributionMethod = (typeof ATTRIBUTION_METHODS)[number];

export interface CodeRedemption {
  id: string;
  codeId: string;
  registrationId: string;
  participantId: string;
  discountAmountApplied: number;
  attributionMethod: AttributionMethod;
  existingLeadAtRedemption: boolean;
  selfReferralAtRedemption: boolean;
  createdAt: string;
}

export const COMMISSION_STATUSES = [
  'pending',
  'approved',
  'payable',
  'paid',
  'clawed_back',
  'redeemed',
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export interface PartnerCommission {
  id: string;
  partnerId: string;
  registrationId: string;
  codeRedemptionId: string;
  commissionAmount: number;
  status: CommissionStatus;
  qualifiesAt: string;
  payoutId: string | null;
  paidAt: string | null;
  clawbackReason: string | null;
  redeemedAgainstRegistrationId: string | null;
  createdAt: string;
}

// Commission-as-course-credit redemption (founder-requested 2026-08-02,
// same-day follow-up) — a partner spends their own 'payable' balance to
// reduce a course fee instead of waiting for a cash payout. No cap on how
// much of the fee it can cover, but never more than the fee's outstanding
// balance (enforced in modules/payments/service.ts's
// applyCreditRedemptionSystem, not here).
// Either a direct registration id (used for "my own course," where the
// caller's own portal already knows the id) or the referred student's
// email (resolved server-side to their most recent registration that still
// has an outstanding balance — see
// modules/payments/service.ts's redeemCommissionCreditSystem).
export const redeemCommissionCreditInputSchema = z
  .object({
    commissionIds: z.array(z.uuid()).min(1),
    targetRegistrationId: z.uuid().nullish(),
    targetParticipantEmail: z.email().transform((value) => value.toLowerCase()).nullish(),
  })
  .refine((input) => input.targetRegistrationId != null || input.targetParticipantEmail != null, {
    message: "Provide either a registration or the referred student's email.",
    path: ['targetRegistrationId'],
  });
export type RedeemCommissionCreditInput = z.infer<typeof redeemCommissionCreditInputSchema>;

// Staff queue view — adds partner/participant/course context the bare row lacks.
export interface PartnerCommissionView extends PartnerCommission {
  partnerName: string;
  partnerCategory: PartnerCategory;
  participantName: string;
  courseName: string;
  cohortLabel: string;
}

export const recordPayoutInputSchema = z.object({
  partnerId: z.uuid(),
  commissionIds: z.array(z.uuid()).min(1),
  method: z.enum(['MTN MoMo', 'Bank Transfer']),
  reference: z.string().trim().max(200).nullish(),
});
export type RecordPayoutInput = z.infer<typeof recordPayoutInputSchema>;

export interface PartnerPayout {
  id: string;
  partnerId: string;
  totalAmount: number;
  method: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string;
}

// --- Portal dashboard ---

export interface PartnerPortalDashboard {
  fullName: string;
  category: PartnerCategory;
  phone: string;
  mustChangePin: boolean;
  codes: Code[];
  clickCounts: Record<string, number>; // codeId -> click count
  redemptionCounts: Record<string, number>; // codeId -> redemption count
  commissionTotals: Record<CommissionStatus, number>;
  recentPayouts: PartnerPayout[];
  payableCommissionIds: string[];
}

// Read-only summary surfaced inside a tutor's or student's existing portal
// login (2026-08-02) — no separate partner-portal account for either.
// commissionTotals.payable IS the redeemable-as-course-credit balance; no
// separate field needed for it.
export interface PartnerReferralSummary {
  codes: Code[];
  commissionTotals: Record<CommissionStatus, number>;
  recentPayouts: PartnerPayout[];
  // Ids of every 'payable' commission — what a "redeem as course credit"
  // action would spend (see redeemCommissionCreditInputSchema above).
  payableCommissionIds: string[];
}
