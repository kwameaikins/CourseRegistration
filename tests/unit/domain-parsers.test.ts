import { describe, expect, it } from 'vitest';

import {
  parseLeadSource,
  parsePaymentMethod,
  parsePaymentStatus,
  parseRegistrationStatus,
  parseStaffRole,
} from '@/lib/domain/parsers';

describe('database-to-domain parsers', () => {
  it('accepts valid constrained database values', () => {
    expect(parseStaffRole('finance')).toBe('finance');
    expect(parseRegistrationStatus('Confirmed')).toBe('Confirmed');
    expect(parsePaymentStatus('Part Payment')).toBe('Part Payment');
    expect(parsePaymentMethod('MTN MoMo')).toBe('MTN MoMo');
    expect(parseLeadSource('Referral')).toBe('Referral');
  });

  it('fails loudly when generated string fields drift from domain constraints', () => {
    expect(() => parseStaffRole('owner')).toThrow('Unexpected staff role');
    expect(() => parseRegistrationStatus('Pending')).toThrow(
      'Unexpected registration status',
    );
    expect(() => parsePaymentStatus('Refunded')).toThrow('Unexpected payment status');
    expect(() => parsePaymentMethod('Cheque')).toThrow('Unexpected payment method');
    expect(() => parseLeadSource('TikTok')).toThrow('Unexpected lead source');
  });
});
