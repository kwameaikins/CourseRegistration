import { z } from 'zod';

export const COUPON_DISCOUNT_TYPES = ['percentage', 'fixed_amount'] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

export const COUPON_STAGES = ['registration', 'post_registration'] as const;
export type CouponStage = (typeof COUPON_STAGES)[number];

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  appliesToCourseId: string | null;
  maxUses: number | null;
  usesCount: number;
  onePerParticipant: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

// The shape previewCoupon returns. Mirrors CodePreview in modules/partners so
// the registration form can treat the two interchangeably, with `reason`
// carrying a message meant to be shown to the student verbatim.
export interface CouponPreview {
  valid: boolean;
  couponId: string | null;
  code: string | null;
  discountType: CouponDiscountType | null;
  discountValue: number | null;
  reason?: string;
}

export const createCouponInputSchema = z.object({
  // Stored and compared upper-case, same as partner codes.
  code: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(200).nullish(),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: z.coerce.number().positive(),
  appliesToCourseId: z.uuid().nullish(),
  maxUses: z.coerce.number().int().positive().nullish(),
  onePerParticipant: z.boolean().default(true),
  startsAt: z.string().nullish(),
  expiresAt: z.string().nullish(),
});

// A coupon made from the study app's cohort page (2026-11-07). It is tied to the batch's COURSE
// (a coupon here is course-scoped, never batch-scoped), and recorded under a named staff member,
// because coupons.created_by must be a staff user and a service call has none of its own.
export const studyAppCouponInputSchema = z
  .object({
    batchId: z.uuid(),
    code: createCouponInputSchema.shape.code,
    description: z.string().trim().max(200).nullish(),
    discountType: z.enum(COUPON_DISCOUNT_TYPES),
    discountValue: z.coerce.number().positive(),
    maxUses: z.coerce.number().int().positive().nullish(),
    expiresAt: z.string().nullish(),
    // Who the coupon is recorded under: an exact staff email (preferred) or an exact full name.
    creatorEmail: z.string().trim().email().max(200).nullish(),
    creatorName: z.string().trim().min(3).max(120).nullish(),
  })
  .refine((v) => Boolean(v.creatorEmail) || Boolean(v.creatorName), {
    message: 'Say which staff member the coupon is recorded under.',
    path: ['creatorName'],
  })
  .refine((v) => v.discountType !== 'percentage' || v.discountValue <= 100, {
    message: 'A percentage discount cannot be more than 100.',
    path: ['discountValue'],
  });
export type StudyAppCouponInput = z.infer<typeof studyAppCouponInputSchema>;

export const updateCouponInputSchema = z.object({
  description: z.string().trim().max(200).nullish(),
  maxUses: z.coerce.number().int().positive().nullish(),
  expiresAt: z.string().nullish(),
  isActive: z.boolean().optional(),
});

// Both the portal and the staff screen post this — the registration is
// identified by the route/session, so only the code travels in the body.
export const applyCouponInputSchema = z.object({
  registrationId: z.uuid(),
  code: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .transform((value) => value.toUpperCase()),
});

export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponInputSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponInputSchema>;
