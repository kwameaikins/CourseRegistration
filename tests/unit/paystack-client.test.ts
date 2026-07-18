import crypto from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ghsToPesewas,
  isValidPaystackSignature,
  pesewasToGhs,
} from '@/lib/paystack/client';

const TEST_SECRET = 'sk_test_unit_secret';

beforeAll(() => {
  process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;
});

describe('BR-13 — Paystack signature validation (T-BR13-01 logic)', () => {
  const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'X' } });

  it('accepts a valid HMAC-SHA512 signature over the raw body', () => {
    const signature = crypto
      .createHmac('sha512', TEST_SECRET)
      .update(rawBody)
      .digest('hex');
    expect(isValidPaystackSignature(rawBody, signature)).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(isValidPaystackSignature(rawBody, null)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = crypto
      .createHmac('sha512', TEST_SECRET)
      .update(rawBody)
      .digest('hex');
    expect(isValidPaystackSignature(rawBody + ' ', signature)).toBe(false);
  });

  it('rejects a signature computed with a different secret', () => {
    const signature = crypto
      .createHmac('sha512', 'wrong-secret')
      .update(rawBody)
      .digest('hex');
    expect(isValidPaystackSignature(rawBody, signature)).toBe(false);
  });
});

describe('kobo/pesewas conversion (Document 5, Section 7)', () => {
  it('converts 120000 pesewas to GHS 1200.00', () => {
    expect(pesewasToGhs(120000)).toBe(1200);
  });

  it('converts GHS 1200.00 to 120000 pesewas', () => {
    expect(ghsToPesewas(1200)).toBe(120000);
  });

  it('round-trips fractional amounts without floating point drift', () => {
    expect(ghsToPesewas(19.99)).toBe(1999);
    expect(pesewasToGhs(1999)).toBe(19.99);
  });
});
