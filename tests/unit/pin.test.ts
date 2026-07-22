import { describe, expect, it } from 'vitest';

import { hashPin, lastFourDigits, verifyPin } from '@/lib/portal-auth/pin';

describe('hashPin / verifyPin', () => {
  it('verifies the correct PIN against its own hash', () => {
    const hash = hashPin('1941');
    expect(verifyPin('1941', hash)).toBe(true);
  });

  it('rejects an incorrect PIN', () => {
    const hash = hashPin('1941');
    expect(verifyPin('0000', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt)', () => {
    expect(hashPin('1941')).not.toBe(hashPin('1941'));
  });

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(verifyPin('1941', 'not-a-real-hash')).toBe(false);
  });
});

describe('lastFourDigits', () => {
  it('extracts the last 4 digits of a local Ghana number', () => {
    expect(lastFourDigits('0245121941')).toBe('1941');
  });

  it('ignores non-digit characters', () => {
    expect(lastFourDigits('+233 24 512 1941')).toBe('1941');
  });

  it('returns null when there are fewer than 4 digits', () => {
    expect(lastFourDigits('12')).toBeNull();
  });
});
