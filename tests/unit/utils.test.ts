import { describe, expect, it } from 'vitest';

import { effectiveCourseFee } from '@/lib/utils';

function batch(overrides: Partial<Parameters<typeof effectiveCourseFee>[0]> = {}) {
  return {
    courseFee: 1200,
    discountCutoffDate: '2026-07-31',
    discountedFee: 900,
    ...overrides,
  };
}

describe('effectiveCourseFee — early-registration discount (Document 5 addendum)', () => {
  it('returns the discounted fee on or before the cutoff date', () => {
    expect(effectiveCourseFee(batch(), '2026-07-31')).toBe(900);
    expect(effectiveCourseFee(batch(), '2026-07-01')).toBe(900);
  });

  it('returns the regular fee after the cutoff date', () => {
    expect(effectiveCourseFee(batch(), '2026-08-01')).toBe(1200);
  });

  it('returns the regular fee when no discount is configured', () => {
    expect(
      effectiveCourseFee(
        batch({ discountCutoffDate: null, discountedFee: null }),
        '2026-07-01',
      ),
    ).toBe(1200);
  });
});
