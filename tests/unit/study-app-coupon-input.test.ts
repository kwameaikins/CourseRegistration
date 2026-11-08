import { describe, expect, it } from 'vitest';

import { studyAppCouponInputSchema } from '@/modules/coupons/types';

const base = {
  batchId: '0b0e203a-e2fd-4897-a289-00e6521e330a',
  code: 'esg30',
  discountType: 'percentage' as const,
  discountValue: 30,
  creatorName: 'Stephen Kwame Aikins',
};

describe('studyAppCouponInputSchema', () => {
  it('upper-cases the code and accepts a 30 percent coupon', () => {
    const parsed = studyAppCouponInputSchema.parse(base);
    expect(parsed.code).toBe('ESG30');
    expect(parsed.discountValue).toBe(30);
  });

  it('refuses a percentage over 100', () => {
    expect(studyAppCouponInputSchema.safeParse({ ...base, discountValue: 120 }).success).toBe(false);
  });

  it('allows a fixed amount above 100 and refuses a zero discount', () => {
    expect(studyAppCouponInputSchema.safeParse({ ...base, discountType: 'fixed_amount', discountValue: 250 }).success).toBe(true);
    expect(studyAppCouponInputSchema.safeParse({ ...base, discountValue: 0 }).success).toBe(false);
  });

  it('needs a creator name or email so a coupon is never recorded under nobody', () => {
    expect(studyAppCouponInputSchema.safeParse({ ...base, creatorName: '' }).success).toBe(false);
    expect(studyAppCouponInputSchema.safeParse({ ...base, creatorName: undefined, creatorEmail: 'a@b.com' }).success).toBe(true);
  });
});
