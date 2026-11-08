import { describe, expect, it } from 'vitest';

import { shapeBatchRegistrants } from '@/modules/registrations/batch-registrants';

describe('shapeBatchRegistrants', () => {
  it('treats a registration with no payment row as Unpaid with nothing paid', () => {
    const [row] = shapeBatchRegistrants([
      {
        registration: { id: 'r1', registration_status: 'Registered', registered_at: '2026-11-01T09:00:00Z', lapsed_at: null },
        participant: { full_name: 'Ama Mensah', email: 'ama@example.com', phone: '+233200000000' },
        payment: null,
      },
    ]);
    expect(row.paymentStatus).toBe('Unpaid');
    expect(row.amountPaid).toBe(0);
    expect(row.balance).toBe(0);
    expect(row.lapsed).toBe(false);
  });

  it('carries the amounts as numbers and flags a written-off registration', () => {
    const [row] = shapeBatchRegistrants([
      {
        registration: { id: 'r2', registration_status: 'Lapsed', registered_at: '2026-11-01T09:00:00Z', lapsed_at: '2026-11-05T00:00:00Z' },
        participant: { full_name: 'Kofi Boateng', email: 'kofi@example.com', phone: '+233240000000' },
        payment: { payment_status: 'Part Payment', course_fee: '1200.00', amount_paid: '400', balance: '800' },
      },
    ]);
    expect(row).toMatchObject({ paymentStatus: 'Part Payment', courseFee: 1200, amountPaid: 400, balance: 800, lapsed: true });
  });

  it('does not throw when the participant record is missing', () => {
    const [row] = shapeBatchRegistrants([
      { registration: { id: 'r3', registration_status: 'Registered', registered_at: '2026-11-01T09:00:00Z', lapsed_at: null }, participant: null, payment: null },
    ]);
    expect(row.fullName).toBe('');
    expect(row.email).toBe('');
  });
});
