import { describe, expect, it } from 'vitest';

import {
  canGenerateSchedule,
  defaultSessionTitle,
  generateSchedule,
  MAX_GENERATED_SESSIONS,
} from '@/modules/live-sessions/schedule';

// Sessions are generated from the batch schedule rather than hand-entered
// (founder direction 2026-08-08). Hand entry is why, across six batches,
// only one had any sessions at all — so the arithmetic here is the thing
// standing between a cohort and a working "Next Class" card.
//
// Day encoding throughout: 1 = Sunday ... 7 = Saturday (Zoom's weekly_days).
const WEEKENDS = [1, 7];
const WEEKDAYS = [2, 3, 4, 5, 6];

const BASE = {
  startDate: '2026-08-01', // a Saturday
  endDate: '2026-08-23',
  startTime: '09:00:00',
  endTime: '12:00:00',
  meetingDays: WEEKENDS,
};

describe('canGenerateSchedule', () => {
  it('needs both an end time and at least one meeting day', () => {
    expect(canGenerateSchedule(BASE)).toBe(true);
    expect(canGenerateSchedule({ ...BASE, endTime: null })).toBe(false);
    expect(canGenerateSchedule({ ...BASE, meetingDays: null })).toBe(false);
    expect(canGenerateSchedule({ ...BASE, meetingDays: [] })).toBe(false);
  });
});

describe('generateSchedule', () => {
  it('emits one session per matching day, numbered in order', () => {
    const sessions = generateSchedule(BASE);
    // 01 Aug 2026 is a Saturday; Sat+Sun across four weekends.
    expect(sessions).toHaveLength(8);
    expect(sessions[0].sessionNumber).toBe(1);
    expect(sessions[0].sessionDate).toBe('2026-08-01');
    expect(sessions[7].sessionNumber).toBe(8);
    expect(sessions[7].sessionDate).toBe('2026-08-23');
  });

  it('states times as Ghana local with an explicit offset, not a bare Z', () => {
    const [first] = generateSchedule(BASE);
    expect(first.startsAt).toBe('2026-08-01T09:00:00+00:00');
    expect(first.endsAt).toBe('2026-08-01T12:00:00+00:00');
  });

  it('handles a weekday cohort across a month boundary', () => {
    const sessions = generateSchedule({
      ...BASE,
      startDate: '2026-08-31', // Monday
      endDate: '2026-09-04', // Friday
      meetingDays: WEEKDAYS,
    });
    expect(sessions.map((s) => s.sessionDate)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('accepts an HH:MM time as readily as HH:MM:SS', () => {
    const [first] = generateSchedule({ ...BASE, startTime: '09:00', endTime: '12:00' });
    expect(first.startsAt).toBe('2026-08-01T09:00:00+00:00');
  });

  // A batch predating the schedule fields is a normal state, not a failure —
  // generation is called opportunistically and must stay quiet.
  it('returns nothing rather than throwing when the batch states no schedule', () => {
    expect(generateSchedule({ ...BASE, endTime: null })).toEqual([]);
    expect(generateSchedule({ ...BASE, meetingDays: null })).toEqual([]);
  });

  it('returns nothing when no chosen day falls inside the range', () => {
    // 03-05 Aug 2026 is Mon-Wed; a weekend cohort never meets.
    expect(
      generateSchedule({ ...BASE, startDate: '2026-08-03', endDate: '2026-08-05' }),
    ).toEqual([]);
  });

  it('returns nothing for an inverted date range', () => {
    expect(generateSchedule({ ...BASE, startDate: '2026-08-23', endDate: '2026-08-01' })).toEqual(
      [],
    );
  });

  it('generates a single session when start and end are the same day', () => {
    const sessions = generateSchedule({
      ...BASE,
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    expect(sessions).toHaveLength(1);
  });

  // A mistyped end_date would otherwise generate hundreds of sessions and
  // blow past Zoom's recurrence limit at the same time.
  it('caps runaway generation from an implausible date range', () => {
    const sessions = generateSchedule({
      ...BASE,
      startDate: '2026-01-01',
      endDate: '2030-12-31',
      meetingDays: WEEKDAYS,
    });
    expect(sessions).toHaveLength(MAX_GENERATED_SESSIONS);
  });
});

describe('defaultSessionTitle', () => {
  it('is unambiguous on a calendar without a tutor naming it', () => {
    expect(defaultSessionTitle('ICAG Level 1 Prep', 3)).toBe('ICAG Level 1 Prep — Session 3');
  });
});
