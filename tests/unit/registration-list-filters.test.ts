import { describe, expect, it } from 'vitest';

import { registrationListFiltersSchema } from '@/modules/registrations/types';

// The Payments screen filters on payment status, which lives on `payments`
// rather than `registrations`. It was applied only AFTER the page slice (in
// the service's post-join pass), so it could only ever filter rows that
// survived the slice. With 267 free ESG2 sign-ups filling the newest-200
// window on 2026-08-06, 27 of 35 outstanding balances became invisible with no
// indication anything was missing. The repository now narrows the id set
// before ordering and paging.
describe('registrationListFiltersSchema.paymentStatus', () => {
  it('accepts the collections-screen value', () => {
    const parsed = registrationListFiltersSchema.parse({ paymentStatus: 'outstanding' });
    expect(parsed.paymentStatus).toBe('outstanding');
  });

  it('still accepts each concrete payment status', () => {
    for (const status of ['Unpaid', 'Part Payment', 'Paid'] as const) {
      expect(registrationListFiltersSchema.parse({ paymentStatus: status }).paymentStatus).toBe(
        status,
      );
    }
  });

  it('rejects an unknown status rather than silently ignoring it', () => {
    expect(() => registrationListFiltersSchema.parse({ paymentStatus: 'unpaid' })).toThrow();
    expect(() => registrationListFiltersSchema.parse({ paymentStatus: 'Outstanding' })).toThrow();
  });

  it('leaves paymentStatus undefined when not supplied', () => {
    expect(registrationListFiltersSchema.parse({}).paymentStatus).toBeUndefined();
  });

  // The limit cap is what makes server-side filtering necessary rather than
  // merely nicer: the screen can never load more than 200 rows in one go.
  it('caps limit at 200, so a filter that is not applied server-side loses rows', () => {
    expect(registrationListFiltersSchema.parse({ limit: '200' }).limit).toBe(200);
    expect(() => registrationListFiltersSchema.parse({ limit: '201' })).toThrow();
  });
});
