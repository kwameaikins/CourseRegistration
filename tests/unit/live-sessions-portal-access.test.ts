import { describe, expect, it } from 'vitest';

import { isJoinLinkLive } from '@/modules/live-sessions/portal-access';

const ENDS_AT = '2026-08-10T12:00:00.000Z';

describe('isJoinLinkLive (founder direction 2026-08-11)', () => {
  it('is live well before the session starts — no pre-start window any more', () => {
    const now = new Date('2026-08-09T18:00:00.000Z');
    expect(isJoinLinkLive(now, ENDS_AT)).toBe(true);
  });

  it('is live while the session is in progress', () => {
    const now = new Date('2026-08-10T10:30:00.000Z');
    expect(isJoinLinkLive(now, ENDS_AT)).toBe(true);
  });

  it('is live at the exact scheduled end', () => {
    expect(isJoinLinkLive(new Date(ENDS_AT), ENDS_AT)).toBe(true);
  });

  it('stays live for a class that overruns its scheduled end', () => {
    const now = new Date('2026-08-10T12:45:00.000Z');
    expect(isJoinLinkLive(now, ENDS_AT)).toBe(true);
  });

  it('closes once the scheduled duration and its overrun grace are past', () => {
    const now = new Date('2026-08-10T13:00:01.000Z');
    expect(isJoinLinkLive(now, ENDS_AT)).toBe(false);
  });
});
