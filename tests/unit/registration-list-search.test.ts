import { beforeEach, describe, expect, it, vi } from 'vitest';

// `search` matches full_name/email/phone, which live on `participants` and are
// joined AFTER the page slice — so the service's post-join pass could only ever
// search the 200 rows that survived the cut. With 267 free ESG sign-ups filling
// the newest-200 window on a single day, searching for anyone who registered
// earlier returned nothing at all, and `total` reported the unsearched count on
// top of that.
//
// Identical in shape to the paymentStatus defect fixed on 2026-08-06 (see
// registration-list-filters.test.ts), one table over. These tests pin the
// property that actually matters: the narrowing happens BEFORE ordering and
// ranging, not after.

const createSupabaseServerClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { selectRegistrationList } from '@/modules/registrations/repository';
import { registrationListFiltersSchema } from '@/modules/registrations/types';

/**
 * Minimal PostgREST-shaped double. Records every builder call so a test can
 * assert on ordering, and resolves to whatever the table was seeded with.
 */
function makeSupabase(seed: Record<string, unknown[]>, calls: string[]) {
  return {
    from(table: string) {
      calls.push(`from:${table}`);
      const builder: Record<string, unknown> = {};
      // Every argument is recorded, not just the first: `.in()` carries the
      // column in args[0] and the id list in args[1], and the id list is
      // precisely what these tests need to assert on. Strings are recorded raw
      // so the quoting in the or() expression stays legible.
      const record = (name: string) => (...args: unknown[]) => {
        const rendered = args
          .map((a) => (typeof a === 'string' ? a : JSON.stringify(a ?? null)))
          .join('|');
        calls.push(`${table}.${name}:${rendered}`);
        return builder;
      };
      for (const method of ['select', 'or', 'eq', 'in', 'is', 'gte', 'lte', 'order']) {
        builder[method] = record(method);
      }
      builder.range = (from: number, to: number) => {
        calls.push(`${table}.range:${from}-${to}`);
        return Promise.resolve({ data: seed[table] ?? [], error: null, count: 0 });
      };
      // Awaiting the builder directly (the un-ranged reads) resolves the same way.
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: seed[table] ?? [], error: null, count: 0 });
      return builder;
    },
  };
}

describe('selectRegistrationList search narrowing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries participants and narrows registrations by participant_id before ranging', async () => {
    const calls: string[] = [];
    createSupabaseServerClient.mockResolvedValue(
      makeSupabase({ participants: [{ id: 'p1' }, { id: 'p2' }] }, calls),
    );

    await selectRegistrationList(
      registrationListFiltersSchema.parse({ search: 'ama', limit: '200' }),
    );

    // The participants lookup must happen at all — this is the whole fix.
    expect(calls).toContain('from:participants');

    const narrowIndex = calls.findIndex((c) =>
      c.startsWith('registrations.in:') && c.includes('p1'),
    );
    const rangeIndex = calls.findIndex((c) => c.startsWith('registrations.range:'));

    expect(narrowIndex).toBeGreaterThan(-1);
    expect(rangeIndex).toBeGreaterThan(-1);
    // The property that was broken: narrowing must precede the page slice.
    expect(narrowIndex).toBeLessThan(rangeIndex);
  });

  it('short-circuits to an empty result when no participant matches', async () => {
    const calls: string[] = [];
    createSupabaseServerClient.mockResolvedValue(makeSupabase({ participants: [] }, calls));

    const result = await selectRegistrationList(
      registrationListFiltersSchema.parse({ search: 'nobody', limit: '200' }),
    );

    expect(result).toEqual({ rows: [], total: 0 });
    // No point paging a table we already know cannot match.
    expect(calls.some((c) => c.startsWith('registrations.range:'))).toBe(false);
  });

  it('does not touch participants when no search term is supplied', async () => {
    const calls: string[] = [];
    createSupabaseServerClient.mockResolvedValue(makeSupabase({}, calls));

    await selectRegistrationList(registrationListFiltersSchema.parse({ limit: '200' }));

    expect(calls).not.toContain('from:participants');
  });

  it('quotes the search term so PostgREST syntax characters cannot corrupt the or() expression', async () => {
    const calls: string[] = [];
    createSupabaseServerClient.mockResolvedValue(
      makeSupabase({ participants: [{ id: 'p1' }] }, calls),
    );

    // A comma is an or() separator and a bracket closes the group; unescaped,
    // either would change which rows match rather than merely failing to find
    // them.
    await selectRegistrationList(
      registrationListFiltersSchema.parse({ search: 'Doe, J (Ltd)', limit: '200' }),
    );

    const orCall = calls.find((c) => c.startsWith('participants.or:'));
    expect(orCall).toBeDefined();
    expect(orCall).toContain('full_name.ilike."%Doe, J (Ltd)%"');
    expect(orCall).toContain('email.ilike.');
    expect(orCall).toContain('phone.ilike.');
  });
});
