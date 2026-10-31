import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mirrorBatchToLms, type BatchMirrorInput } from '@/lib/knowsia-lms/cohorts';

const fetchMock = vi.fn();

const batch: BatchMirrorInput = {
  batchId: 'b-1',
  courseCode: 'CA01',
  courseName: 'Sage Accounting',
  cohortLabel: 'May',
  startDate: '2026-05-01',
  endDate: '2026-05-30',
  startTime: '18:00:00',
  endTime: '20:00:00',
  meetingDays: [3, 5],
  facilitatorName: 'Ama',
  capacity: 30,
  isFree: false,
  isUnlisted: false,
  isActive: true,
  classReminderEnabled: true,
  zoomMeetingId: null,
  zoomLink: null,
  whatsappGroupLink: null,
  resourcesLink: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ cohort_id: 'c', created: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  process.env.KNOWSIA_LMS_API_URL = 'https://lms.test';
  process.env.KNOWSIA_APP_SERVICE_KEY = 'k';
});
afterEach(() => vi.unstubAllGlobals());

describe('mirrorBatchToLms', () => {
  it('carries what the course prints on its certificate', async () => {
    await mirrorBatchToLms({
      ...batch,
      certificateCourseTitle: 'Sage Accounting',
      certificateHours: 6.5,
      certificateDescription: 'Hands-on bookkeeping.',
      certificateCpdCredit: '6.5',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.certificate_course_title).toBe('Sage Accounting');
    expect(body.certificate_hours).toBe(6.5);
    expect(body.certificate_description).toBe('Hands-on bookkeeping.');
    expect(body.certificate_cpd_credit).toBe('6.5');
  });

  it('leaves the fields out when the caller has none, so the LMS keeps what it holds', async () => {
    await mirrorBatchToLms(batch);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect('certificate_course_title' in body).toBe(false);
    expect('certificate_hours' in body).toBe(false);
    expect('certificate_description' in body).toBe(false);
    expect('certificate_cpd_credit' in body).toBe(false);
  });
});
