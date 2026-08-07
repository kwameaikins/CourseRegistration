import { beforeEach, describe, expect, it, vi } from 'vitest';

const couponsRepositoryMock = {
  selectCouponByCodeSystem: vi.fn(),
  selectCouponByIdSystem: vi.fn(),
  countRedemptionsForCouponAndParticipantSystem: vi.fn(),
  selectRedemptionByRegistrationSystem: vi.fn(),
  insertCouponRedemptionSystem: vi.fn(),
  incrementCouponUsesSystem: vi.fn(),
  countRecentAttemptsSystem: vi.fn(),
  insertFailedAttemptSystem: vi.fn(),
  selectCoupons: vi.fn(),
  selectRedemptionCountsByCoupon: vi.fn(),
  insertCoupon: vi.fn(),
  updateCouponById: vi.fn(),
};
const coursesServiceMock = { getBatchByIdSystem: vi.fn() };
const usersServiceMock = { requireRole: vi.fn() };

vi.mock('@/modules/coupons/repository', () => couponsRepositoryMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/modules/users/service', () => usersServiceMock);

const {
  assertAttemptAllowed,
  computeCouponFee,
  createCoupon,
  listCoupons,
  previewCoupon,
  recordCouponRedemptionSystem,
} = await import('@/modules/coupons/service');

const NOW = new Date('2026-08-07T12:00:00.000Z');

function couponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coupon-1',
    code: 'NEWYEAR25',
    description: null,
    discount_type: 'percentage',
    discount_value: 25,
    applies_to_course_id: null,
    max_uses: null,
    uses_count: 0,
    one_per_participant: true,
    starts_at: null,
    expires_at: null,
    is_active: true,
    created_by: 'staff-1',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(couponRow());
  couponsRepositoryMock.selectCouponByIdSystem.mockResolvedValue(couponRow());
  couponsRepositoryMock.countRedemptionsForCouponAndParticipantSystem.mockResolvedValue(0);
  couponsRepositoryMock.selectRedemptionByRegistrationSystem.mockResolvedValue(null);
  couponsRepositoryMock.countRecentAttemptsSystem.mockResolvedValue(0);
  coursesServiceMock.getBatchByIdSystem.mockResolvedValue({
    id: 'batch-1',
    courseId: 'course-1',
  });
  usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
});

describe('previewCoupon', () => {
  it('accepts a plain active coupon', async () => {
    const preview = await previewCoupon('NEWYEAR25', 'batch-1', {}, NOW);
    expect(preview).toMatchObject({
      valid: true,
      couponId: 'coupon-1',
      discountType: 'percentage',
      discountValue: 25,
    });
  });

  it('rejects an unknown or deactivated code', async () => {
    couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(null);
    await expect(previewCoupon('NOPE', 'batch-1', {}, NOW)).resolves.toMatchObject({
      valid: false,
    });

    couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(
      couponRow({ is_active: false }),
    );
    await expect(previewCoupon('NEWYEAR25', 'batch-1', {}, NOW)).resolves.toMatchObject({
      valid: false,
    });
  });

  it('respects the start/expiry window', async () => {
    couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(
      couponRow({ starts_at: '2026-09-01T00:00:00.000Z' }),
    );
    await expect(previewCoupon('NEWYEAR25', 'batch-1', {}, NOW)).resolves.toMatchObject({
      valid: false,
      reason: 'This code is not active yet.',
    });

    couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(
      couponRow({ expires_at: '2026-08-01T00:00:00.000Z' }),
    );
    await expect(previewCoupon('NEWYEAR25', 'batch-1', {}, NOW)).resolves.toMatchObject({
      valid: false,
      reason: 'This code has expired.',
    });
  });

  it('refuses once max_uses is reached', async () => {
    couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(
      couponRow({ max_uses: 5, uses_count: 5 }),
    );
    await expect(previewCoupon('NEWYEAR25', 'batch-1', {}, NOW)).resolves.toMatchObject({
      valid: false,
      reason: 'This code has reached its usage limit.',
    });
  });

  it('enforces course scope against the batch', async () => {
    couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(
      couponRow({ applies_to_course_id: 'course-OTHER' }),
    );
    await expect(previewCoupon('NEWYEAR25', 'batch-1', {}, NOW)).resolves.toMatchObject({
      valid: false,
      reason: 'This code does not apply to this course.',
    });
  });

  // Unlike modules/partners' previewCode, which defers these to redemption
  // and then fails silently, both limits are enforced here so the caller can
  // tell the student why.
  it('refuses a registration that already has a coupon', async () => {
    couponsRepositoryMock.selectRedemptionByRegistrationSystem.mockResolvedValue({
      id: 'redemption-1',
    });
    await expect(
      previewCoupon('NEWYEAR25', 'batch-1', { registrationId: 'reg-1' }, NOW),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'A discount code has already been applied to this registration.',
    });
  });

  it('enforces one_per_participant', async () => {
    couponsRepositoryMock.countRedemptionsForCouponAndParticipantSystem.mockResolvedValue(1);
    await expect(
      previewCoupon('NEWYEAR25', 'batch-1', { participantId: 'p-1' }, NOW),
    ).resolves.toMatchObject({ valid: false, reason: 'You have already used this code.' });
  });

  it('allows repeat use when one_per_participant is off', async () => {
    couponsRepositoryMock.selectCouponByCodeSystem.mockResolvedValue(
      couponRow({ one_per_participant: false }),
    );
    couponsRepositoryMock.countRedemptionsForCouponAndParticipantSystem.mockResolvedValue(3);
    await expect(
      previewCoupon('NEWYEAR25', 'batch-1', { participantId: 'p-1' }, NOW),
    ).resolves.toMatchObject({ valid: true });
  });
});

describe('computeCouponFee', () => {
  it('applies a percentage off the base fee', () => {
    expect(computeCouponFee(1200, 'percentage', 25)).toBe(900);
  });

  it('applies a fixed amount off the base fee', () => {
    expect(computeCouponFee(1200, 'fixed_amount', 300)).toBe(900);
  });

  // public.codes' percentage branch is not floored, which is why the coupons
  // table also carries a discount_value <= 100 CHECK. Both branches floor here.
  it('never returns a negative fee', () => {
    expect(computeCouponFee(1200, 'fixed_amount', 5000)).toBe(0);
    expect(computeCouponFee(1200, 'percentage', 100)).toBe(0);
  });

  it('rounds to two decimals', () => {
    expect(computeCouponFee(999.99, 'percentage', 33)).toBe(669.99);
  });
});

describe('recordCouponRedemptionSystem', () => {
  it('writes the redemption and bumps the usage counter', async () => {
    couponsRepositoryMock.selectCouponByIdSystem.mockResolvedValue(
      couponRow({ uses_count: 4 }),
    );

    await recordCouponRedemptionSystem({
      couponId: 'coupon-1',
      registrationId: 'reg-1',
      participantId: 'p-1',
      discountAmountApplied: 300,
      stage: 'post_registration',
      appliedByStaffId: null,
    });

    expect(couponsRepositoryMock.insertCouponRedemptionSystem).toHaveBeenCalledWith({
      coupon_id: 'coupon-1',
      registration_id: 'reg-1',
      participant_id: 'p-1',
      discount_amount_applied: 300,
      applied_at_stage: 'post_registration',
      applied_by_staff_id: null,
    });
    expect(couponsRepositoryMock.incrementCouponUsesSystem).toHaveBeenCalledWith('coupon-1', 5);
  });
});

describe('attempt throttle', () => {
  it('allows attempts below the threshold', async () => {
    couponsRepositoryMock.countRecentAttemptsSystem.mockResolvedValue(9);
    await expect(assertAttemptAllowed('p-1')).resolves.toBeUndefined();
  });

  it('locks out at 10 failures in the window', async () => {
    couponsRepositoryMock.countRecentAttemptsSystem.mockResolvedValue(10);
    await expect(assertAttemptAllowed('p-1')).rejects.toMatchObject({ code: 'LOCKED' });
  });
});

describe('authorization — coupon catalogue', () => {
  it('opens the list to admin, marketing and finance', async () => {
    couponsRepositoryMock.selectCoupons.mockResolvedValue([]);
    couponsRepositoryMock.selectRedemptionCountsByCoupon.mockResolvedValue(new Map());
    await listCoupons();
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'marketing', 'finance']);
  });

  it('restricts creation to admin and marketing', async () => {
    couponsRepositoryMock.insertCoupon.mockResolvedValue(couponRow());
    await createCoupon({
      code: 'NEWYEAR25',
      discountType: 'percentage',
      discountValue: 25,
      onePerParticipant: true,
    } as never);
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'marketing']);
  });

  it('surfaces a duplicate code as a 409', async () => {
    couponsRepositoryMock.insertCoupon.mockRejectedValue({ code: '23505' });
    await expect(
      createCoupon({
        code: 'NEWYEAR25',
        discountType: 'percentage',
        discountValue: 25,
        onePerParticipant: true,
      } as never),
    ).rejects.toMatchObject({ code: 'DUPLICATE_COUPON' });
  });
});
