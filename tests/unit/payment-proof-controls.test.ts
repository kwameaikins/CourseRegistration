import { describe, expect, it } from 'vitest';

import { flagWords, normalizeReference, paystackMatchFlags, referenceCandidates } from '@/modules/payments/proof-controls';

// Pure rules behind the payment-proof controls (2026-10-16).

describe('references', () => {
  it('one transaction, however it is typed', () => {
    expect(normalizeReference(' mp 2610.16-abc ')).toBe('MP261016ABC');
    expect(normalizeReference(null)).toBe('');
    expect(referenceCandidates('mp 123')).toEqual(['mp 123', 'MP123']);
    expect(referenceCandidates('91641510783')).toEqual(['91641510783']);
  });
});

describe('a proof that may repeat a Paystack payment', () => {
  const paystack = [
    { amount: '2.00', transaction_id: 'REG-a', recorded_at: '2026-10-16T06:08:00Z' },
    { amount: 2, transaction_id: 'REG-b', recorded_at: '2026-10-25T06:08:00Z' },
    { amount: 3, transaction_id: 'REG-c', recorded_at: '2026-10-16T06:08:00Z' },
  ];
  it('same amount within 3 days is flagged; another amount or a later week is not', () => {
    expect(paystackMatchFlags({ amount: 2, paymentDate: '2026-10-16' }, paystack).map((f) => f.reference)).toEqual(['REG-a']);
    expect(paystackMatchFlags({ amount: 2, paymentDate: '2026-10-19' }, paystack).map((f) => f.reference)).toEqual(['REG-a']);
    expect(paystackMatchFlags({ amount: 2, paymentDate: '2026-10-20' }, paystack)).toEqual([]);
    expect(paystackMatchFlags({ amount: 5, paymentDate: '2026-10-16' }, paystack)).toEqual([]);
  });
  it('says it in words', () => {
    const [f] = paystackMatchFlags({ amount: 2, paymentDate: '2026-10-16' }, paystack);
    expect(flagWords([f])).toEqual(['Possible duplicate: a Paystack payment of GH₵ 2.00 on 2026-10-16 (REG-a) already covers this registration.']);
  });
});
