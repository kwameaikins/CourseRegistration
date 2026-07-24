import { describe, expect, it } from 'vitest';

import { buildCourseIcsAttachment } from '@/lib/calendar/ics';

function decode(attachment: { content: string }): string {
  return Buffer.from(attachment.content, 'base64').toString('utf-8');
}

const BASE_PARAMS = {
  registrationId: 'reg-123',
  courseName: 'AI for Business',
  cohortLabel: 'Cohort 4',
  startDate: '2026-08-10',
  startTime: '09:00',
  endDate: '2026-08-12',
  facilitatorName: 'Mr. Asante',
  zoomLink: 'https://zoom.us/j/123456' as string | null,
};

describe('buildCourseIcsAttachment', () => {
  it('produces a well-formed single-VEVENT VCALENDAR', () => {
    const ics = decode(buildCourseIcsAttachment(BASE_PARAMS));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:reg-123@reg.knowsia.com');
    expect(ics).toContain('SUMMARY:AI for Business — Cohort 4');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('treats start_date/start_time as UTC (Africa/Accra, no DST) for DTSTART', () => {
    const ics = decode(buildCourseIcsAttachment(BASE_PARAMS));
    expect(ics).toContain('DTSTART:20260810T090000Z');
  });

  it('defaults DTEND to a 3-hour block after DTSTART', () => {
    const ics = decode(buildCourseIcsAttachment(BASE_PARAMS));
    expect(ics).toContain('DTEND:20260810T120000Z');
  });

  it('uses the Zoom link as LOCATION when present', () => {
    const ics = decode(buildCourseIcsAttachment(BASE_PARAMS));
    expect(ics).toContain('LOCATION:https://zoom.us/j/123456');
  });

  it('falls back to a placeholder LOCATION when there is no Zoom link yet', () => {
    const ics = decode(buildCourseIcsAttachment({ ...BASE_PARAMS, zoomLink: null }));
    expect(ics).toContain('LOCATION:Online — Zoom link to follow');
  });

  it('escapes commas in SUMMARY per RFC5545', () => {
    const ics = decode(
      buildCourseIcsAttachment({ ...BASE_PARAMS, courseName: 'Excel, Advanced' }),
    );
    expect(ics).toContain('SUMMARY:Excel\\, Advanced — Cohort 4');
  });

  it('returns base64 content with the calendar content type', () => {
    const attachment = buildCourseIcsAttachment(BASE_PARAMS);
    expect(attachment.filename).toBe('course-invite.ics');
    expect(attachment.contentType).toContain('text/calendar');
    // Round-trips cleanly through base64.
    expect(() => Buffer.from(attachment.content, 'base64')).not.toThrow();
  });
});
