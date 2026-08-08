import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Time-boxed classrooms (founder-flagged 2026-08-08). The whole point of
// these tests is the meeting TYPE and the fields that hang off it: a type 3
// meeting has no start_time, so Zoom's jbh_time has nothing to count back
// from and the room stays open at every hour, forever.
const {
  countRecurrenceOccurrences,
  createBatchClassroomMeeting,
  GHANA_TIMEZONE,
  ZOOM_MAX_RECURRENCE_OCCURRENCES,
} = await import('@/lib/zoom/client');

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function mockZoom() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.includes('oauth')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
        status: 200,
      });
    }
    calls.push({
      url: href,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ id: 82912345678, join_url: 'https://zoom.us/j/x' }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  process.env.ZOOM_ACCOUNT_ID = 'acct';
  process.env.ZOOM_CLIENT_ID = 'cid';
  process.env.ZOOM_CLIENT_SECRET = 'secret';
  process.env.ZOOM_HOST_EMAIL = 'host@knowsia.com';
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('countRecurrenceOccurrences', () => {
  // Zoom's weekly_days encoding: 1 = Sunday ... 7 = Saturday.
  it('counts only the days a cohort actually meets', () => {
    // 01 Aug 2026 is a Saturday. Sat+Sun over four weekends = 8 sessions.
    expect(countRecurrenceOccurrences('2026-08-01', '2026-08-23', [1, 7])).toBe(8);
  });

  it('counts a weekday-only cohort correctly', () => {
    // Mon-Fri across two full weeks starting Mon 03 Aug 2026.
    expect(countRecurrenceOccurrences('2026-08-03', '2026-08-14', [2, 3, 4, 5, 6])).toBe(10);
  });

  it('is zero when no chosen day falls inside the range', () => {
    // 03-05 Aug 2026 is Mon-Wed; a Sunday-only cohort never meets.
    expect(countRecurrenceOccurrences('2026-08-03', '2026-08-05', [1])).toBe(0);
  });

  it('is zero when the range is inverted', () => {
    expect(countRecurrenceOccurrences('2026-08-20', '2026-08-01', [1, 7])).toBe(0);
  });
});

describe('createBatchClassroomMeeting', () => {
  it('creates a FIXED-time recurring meeting so jbh_time has a start to measure from', async () => {
    const calls = mockZoom();

    await createBatchClassroomMeeting({
      topic: 'ICAG Level 1 Prep — AUG-2026',
      startDate: '2026-08-01',
      startTime: '09:00:00',
      endTime: '12:00:00',
      endDate: '2026-08-23',
      meetingDays: [1, 7],
    });

    const body = calls[0].body as Record<string, unknown>;
    // Type 8 — recurring with fixed time. Type 3 is what left the room open.
    expect(body.type).toBe(8);
    expect(body.duration).toBe(180);
    // Ghana time, stated explicitly rather than inherited from the host
    // account. Note the start_time carries NO trailing Z: with a timezone
    // set, Zoom reads it as local, which is the whole point.
    expect(body.timezone).toBe(GHANA_TIMEZONE);
    expect(body.start_time).toBe('2026-08-01T09:00:00');
    expect(String(body.start_time)).not.toContain('Z');
    expect(body.recurrence).toEqual({
      type: 2,
      repeat_interval: 1,
      weekly_days: '1,7',
      end_date_time: '2026-08-23T23:59:00Z',
    });

    const settings = body.settings as Record<string, unknown>;
    expect(settings.jbh_time).toBe(15);
    expect(settings.join_before_host).toBe(true);
  });

  // A series that hits Zoom's cap ends EARLY and silently, which for a
  // join-before-host meeting means students locked out of the back half of
  // their own course. Better to fail and let the caller fall back.
  it('refuses a course longer than Zoom will schedule', async () => {
    mockZoom();
    await expect(
      createBatchClassroomMeeting({
        topic: 'Long course',
        startDate: '2026-01-01',
        startTime: '09:00',
        endTime: '12:00',
        endDate: '2026-12-31',
        meetingDays: [2, 3, 4, 5, 6],
      }),
    ).rejects.toThrow(new RegExp(String(ZOOM_MAX_RECURRENCE_OCCURRENCES)));
  });

  it('refuses a batch whose chosen days never occur in its date range', async () => {
    mockZoom();
    await expect(
      createBatchClassroomMeeting({
        topic: 'Impossible',
        startDate: '2026-08-03',
        startTime: '09:00',
        endTime: '12:00',
        endDate: '2026-08-05',
        meetingDays: [1],
      }),
    ).rejects.toThrow(/no class days/i);
  });

  it('refuses an end time that is not after the start time', async () => {
    mockZoom();
    await expect(
      createBatchClassroomMeeting({
        topic: 'Backwards',
        startDate: '2026-08-01',
        startTime: '12:00',
        endTime: '09:00',
        endDate: '2026-08-23',
        meetingDays: [1, 7],
      }),
    ).rejects.toThrow(/after its start time/i);
  });
});
