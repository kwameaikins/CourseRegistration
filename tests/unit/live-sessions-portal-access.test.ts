import { describe, expect, it } from 'vitest';

import { isWithinJoinWindow } from '@/modules/live-sessions/portal-access';

const STARTS_AT = '2026-08-10T09:00:00.000Z';
const ENDS_AT = '2026-08-10T12:00:00.000Z';

describe('isWithinJoinWindow (Document 14, Section 5, step 4)', () => {
  it('is false more than 15 minutes before the session starts', () => {
    const now = new Date('2026-08-10T08:30:00.000Z');
    expect(isWithinJoinWindow(now, STARTS_AT, ENDS_AT)).toBe(false);
  });

  it('opens exactly 15 minutes before the scheduled start', () => {
    const now = new Date('2026-08-10T08:45:00.000Z');
    expect(isWithinJoinWindow(now, STARTS_AT, ENDS_AT)).toBe(true);
  });

  it('stays open while the session is in progress', () => {
    const now = new Date('2026-08-10T10:30:00.000Z');
    expect(isWithinJoinWindow(now, STARTS_AT, ENDS_AT)).toBe(true);
  });

  it('stays open at the exact scheduled end', () => {
    const now = new Date(ENDS_AT);
    expect(isWithinJoinWindow(now, STARTS_AT, ENDS_AT)).toBe(true);
  });

  it('closes after the scheduled end', () => {
    const now = new Date('2026-08-10T12:00:01.000Z');
    expect(isWithinJoinWindow(now, STARTS_AT, ENDS_AT)).toBe(false);
  });
});
