// Standalone coupon codes (founder-approved 2026-08-07) — marketing discounts
// with no partner attribution and no commission. The affiliate programme lives
// in modules/partners; the two are deliberately independent, down to separate
// redemption tables, so a registration can carry both.
//
// This module owns validation and the redemption record. It does NOT own the
// fee mutation — modules/payments does, the same accrual/payout split already
// established between payments and partners.
import { AppError } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as couponsRepository from '@/modules/coupons/repository';
import type { CouponRow } from '@/modules/coupons/repository';
import type {
  Coupon,
  CouponDiscountType,
  CouponPreview,
  CouponStage,
  CreateCouponInput,
  UpdateCouponInput,
} from '@/modules/coupons/types';
import * as usersService from '@/modules/users/service';

const COUPON_MANAGE_ROLES = ['admin', 'marketing'] as const;
const COUPON_READ_ROLES = ['admin', 'marketing', 'finance'] as const;

// Mirrors the PIN lockout in modules/portal/service.ts. A coupon code is a
// short guessable string and this app has no general rate limiter, so the
// participant-facing path throttles by hand.
const ATTEMPT_THRESHOLD = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discount_type as CouponDiscountType,
    discountValue: Number(row.discount_value),
    appliesToCourseId: row.applies_to_course_id,
    maxUses: row.max_uses,
    usesCount: row.uses_count,
    onePerParticipant: row.one_per_participant,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

const invalid = (reason: string): CouponPreview => ({
  valid: false,
  couponId: null,
  code: null,
  discountType: null,
  discountValue: null,
  reason,
});

// Validates a code against a batch, and — when a participant/registration is
// in hand — against the per-participant and per-registration limits too.
//
// Unlike modules/partners' previewCode, every rule is enforced HERE rather
// than half here and half in the redemption call. previewCode's split lets
// redeemCodeSystem fail silently on one_per_participant, so the caller cannot
// tell the redemption never happened; this returns a reason the caller can
// show the student.
export async function previewCoupon(
  code: string,
  batchId: string,
  context: { participantId?: string; registrationId?: string } = {},
  now: Date = new Date(),
): Promise<CouponPreview> {
  const coupon = await couponsRepository.selectCouponByCodeSystem(code);
  if (!coupon || !coupon.is_active) {
    return invalid('This code is not valid.');
  }
  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return invalid('This code is not active yet.');
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return invalid('This code has expired.');
  }
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return invalid('This code has reached its usage limit.');
  }
  if (coupon.applies_to_course_id) {
    const batch = await coursesService.getBatchByIdSystem(batchId);
    if (!batch || batch.courseId !== coupon.applies_to_course_id) {
      return invalid('This code does not apply to this course.');
    }
  }
  if (context.registrationId) {
    const existing = await couponsRepository.selectRedemptionByRegistrationSystem(
      context.registrationId,
    );
    if (existing) {
      return invalid('A discount code has already been applied to this registration.');
    }
  }
  if (coupon.one_per_participant && context.participantId) {
    const priorCount = await couponsRepository.countRedemptionsForCouponAndParticipantSystem(
      coupon.id,
      context.participantId,
    );
    if (priorCount > 0) {
      return invalid('You have already used this code.');
    }
  }

  return {
    valid: true,
    couponId: coupon.id,
    code: coupon.code,
    discountType: coupon.discount_type as CouponDiscountType,
    discountValue: Number(coupon.discount_value),
  };
}

// The fee a coupon would produce from `baseFee`. Floored at zero on both
// branches — public.codes' percentage branch is not, which is why the coupons
// table also carries a discount_value <= 100 CHECK.
export function computeCouponFee(
  baseFee: number,
  discountType: CouponDiscountType,
  discountValue: number,
): number {
  const discounted =
    discountType === 'percentage'
      ? baseFee * (1 - discountValue / 100)
      : baseFee - discountValue;
  return round2(Math.max(0, discounted));
}

// Written only once the fee change has actually landed — see the ordering
// note in modules/payments/service.ts's applyCouponToRegistrationSystem.
export async function recordCouponRedemptionSystem(input: {
  couponId: string;
  registrationId: string;
  participantId: string;
  discountAmountApplied: number;
  stage: CouponStage;
  appliedByStaffId: string | null;
}): Promise<void> {
  await couponsRepository.insertCouponRedemptionSystem({
    coupon_id: input.couponId,
    registration_id: input.registrationId,
    participant_id: input.participantId,
    discount_amount_applied: input.discountAmountApplied,
    applied_at_stage: input.stage,
    applied_by_staff_id: input.appliedByStaffId,
  });

  // uses_count is a convenience counter for the admin screen and the max_uses
  // check; coupon_redemptions is the source of truth. Read-modify-write, like
  // incrementCodeUsesSystem — two simultaneous redemptions can under-count,
  // which costs at most one extra use over a max_uses limit and never
  // double-charges anyone.
  const coupon = await couponsRepository.selectCouponByIdSystem(input.couponId);
  if (coupon) {
    await couponsRepository.incrementCouponUsesSystem(coupon.id, coupon.uses_count + 1);
  }
}

// --- Attempt throttle (participant-facing path only) ---

export async function assertAttemptAllowed(participantId: string): Promise<void> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  const recent = await couponsRepository.countRecentAttemptsSystem(participantId, since);
  if (recent >= ATTEMPT_THRESHOLD) {
    throw new AppError(
      'LOCKED',
      'Too many invalid codes. Please wait 15 minutes and try again.',
      429,
    );
  }
}

export async function recordFailedAttempt(participantId: string): Promise<void> {
  await couponsRepository.insertFailedAttemptSystem(participantId);
}

// --- Staff catalogue management ---

export async function listCoupons(): Promise<(Coupon & { redemptionCount: number })[]> {
  await usersService.requireRole([...COUPON_READ_ROLES]);
  const [rows, counts] = await Promise.all([
    couponsRepository.selectCoupons(),
    couponsRepository.selectRedemptionCountsByCoupon(),
  ]);
  return rows.map((row) => ({ ...toCoupon(row), redemptionCount: counts.get(row.id) ?? 0 }));
}

export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  const staffUser = await usersService.requireRole([...COUPON_MANAGE_ROLES]);
  try {
    const row = await couponsRepository.insertCoupon(input, staffUser.id);
    return toCoupon(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('DUPLICATE_COUPON', 'That code is already in use.', 409);
    }
    throw err;
  }
}

export async function updateCoupon(
  couponId: string,
  changes: UpdateCouponInput,
): Promise<Coupon> {
  await usersService.requireRole([...COUPON_MANAGE_ROLES]);
  const row = await couponsRepository.updateCouponById(couponId, changes);
  return toCoupon(row);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}
