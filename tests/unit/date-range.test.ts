import { describe, expect, it } from 'vitest';

import { parseDateRange, timestampBounds } from '@/lib/date-range';

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('parseDateRange', () => {
  it('returns both bounds when supplied', () => {
    expect(parseDateRange(params('dateFrom=2026-07-01&dateTo=2026-07-31'))).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });
  });

  it('allows an open-ended range in either direction', () => {
    expect(parseDateRange(params('dateFrom=2026-07-01'))).toEqual({
      dateFrom: '2026-07-01',
      dateTo: undefined,
    });
    expect(parseDateRange(params('dateTo=2026-07-31'))).toEqual({
      dateFrom: undefined,
      dateTo: '2026-07-31',
    });
  });

  it('returns an empty range when nothing is supplied', () => {
    expect(parseDateRange(params(''))).toEqual({ dateFrom: undefined, dateTo: undefined });
  });

  // A malformed date must not degrade into "no filter" — on a capped list that
  // silently returns a different set of rows and still looks like an answer.
  it('rejects a malformed date rather than ignoring it', () => {
    expect(() => parseDateRange(params('dateFrom=01/07/2026'))).toThrow();
    expect(() => parseDateRange(params('dateTo=2026-7-1'))).toThrow();
    expect(() => parseDateRange(params('dateFrom=yesterday'))).toThrow();
  });

  it('rejects an inverted range', () => {
    expect(() => parseDateRange(params('dateFrom=2026-07-31&dateTo=2026-07-01'))).toThrow();
  });

  it('accepts a single-day range', () => {
    expect(parseDateRange(params('dateFrom=2026-07-15&dateTo=2026-07-15'))).toEqual({
      dateFrom: '2026-07-15',
      dateTo: '2026-07-15',
    });
  });
});

describe('timestampBounds', () => {
  // The whole point: dateTo names a calendar DAY. Stopping at its opening
  // midnight would silently drop everything that happened on the last day of
  // the range.
  it('extends dateTo to the end of that day', () => {
    expect(timestampBounds({ dateFrom: '2026-07-01', dateTo: '2026-07-31' })).toEqual({
      gte: '2026-07-01T00:00:00Z',
      lte: '2026-07-31T23:59:59.999Z',
    });
  });

  it('leaves an absent bound undefined rather than inventing one', () => {
    expect(timestampBounds({ dateFrom: '2026-07-01' })).toEqual({
      gte: '2026-07-01T00:00:00Z',
      lte: undefined,
    });
    expect(timestampBounds({})).toEqual({ gte: undefined, lte: undefined });
  });

  it('covers a full single day for a same-day range', () => {
    const bounds = timestampBounds({ dateFrom: '2026-08-06', dateTo: '2026-08-06' });
    expect(bounds.gte).toBe('2026-08-06T00:00:00Z');
    expect(bounds.lte).toBe('2026-08-06T23:59:59.999Z');
  });
});
