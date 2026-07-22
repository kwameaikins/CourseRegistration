import { beforeEach, describe, expect, it, vi } from 'vitest';

const coursesRepositoryMock = {
  insertCourse: vi.fn(),
  updateCourseById: vi.fn(),
  selectBatches: vi.fn(),
  insertBatch: vi.fn(),
  updateBatchById: vi.fn(),
  selectCourseByIdSystem: vi.fn(),
  selectBatchByIdSystem: vi.fn(),
};
const seedDefaultTemplatesForCourseMock = vi.fn();
const zoomClientMock = {
  createZoomMeeting: vi.fn(),
  isZoomMeetingCreateConfigured: vi.fn(),
};

vi.mock('@/modules/courses/repository', () => coursesRepositoryMock);
vi.mock('@/modules/communications/default-templates', () => ({
  seedDefaultTemplatesForCourse: (...args: unknown[]) => seedDefaultTemplatesForCourseMock(...args),
}));
vi.mock('@/lib/zoom/client', () => zoomClientMock);

const { createCourse, createBatch } = await import('@/modules/courses/service');

function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'course-1',
    course_code: 'AI05',
    course_name: 'AI-Powered Financial Reporting and Modeling',
    certificate_hours: 20,
    certificate_description: '',
    cpd_credit: 'TBD',
    certificate_serial_floor: 0,
    zoom_link: null,
    zoom_meeting_id: null,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seedDefaultTemplatesForCourseMock.mockResolvedValue(1);
  zoomClientMock.isZoomMeetingCreateConfigured.mockReturnValue(true);
  coursesRepositoryMock.insertCourse.mockResolvedValue(courseRow());
});

function validCourseInput() {
  return {
    courseCode: 'AI05',
    courseName: 'AI-Powered Financial Reporting and Modeling',
    certificateHours: 20,
    certificateDescription: '',
    cpdCredit: 'TBD',
  };
}

describe('createCourse — auto-creates a persistent Zoom meeting', () => {
  it('creates a Zoom meeting and stores its id/link on the new course', async () => {
    zoomClientMock.createZoomMeeting.mockResolvedValue({
      meetingId: '82912345678',
      joinUrl: 'https://zoom.us/j/82912345678',
    });

    await createCourse(validCourseInput());

    expect(zoomClientMock.createZoomMeeting).toHaveBeenCalledWith(
      'AI-Powered Financial Reporting and Modeling',
    );
    expect(coursesRepositoryMock.insertCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom_link: 'https://zoom.us/j/82912345678',
        zoom_meeting_id: '82912345678',
      }),
    );
  });

  it('still creates the course with null Zoom fields when Zoom is not configured', async () => {
    zoomClientMock.isZoomMeetingCreateConfigured.mockReturnValue(false);

    await createCourse(validCourseInput());

    expect(zoomClientMock.createZoomMeeting).not.toHaveBeenCalled();
    expect(coursesRepositoryMock.insertCourse).toHaveBeenCalledWith(
      expect.objectContaining({ zoom_link: null, zoom_meeting_id: null }),
    );
  });

  it('still creates the course when the Zoom API call fails (non-blocking)', async () => {
    zoomClientMock.createZoomMeeting.mockRejectedValue(new Error('Zoom down'));

    const result = await createCourse(validCourseInput());

    expect(result.id).toBe('course-1');
    expect(coursesRepositoryMock.insertCourse).toHaveBeenCalledWith(
      expect.objectContaining({ zoom_link: null, zoom_meeting_id: null }),
    );
  });
});

describe('createBatch — inherits the parent Course\'s Zoom meeting', () => {
  function validBatchInput() {
    return {
      courseId: 'course-1',
      cohortLabel: 'JUL-2026',
      courseFee: 1200,
      startDate: '2026-08-01',
      startTime: '09:00',
      endDate: '2026-08-05',
      whatsappGroupLink: null,
      facilitatorName: 'Mr. Asante',
      facilitatorStaffId: null,
      welcomeEmailEnabled: true,
      paymentReminderEnabled: true,
      classReminderEnabled: true,
      whatsappEnabled: true,
      smsEnabled: true,
      isActive: true,
      discountCutoffDate: null,
      discountedFee: null,
    };
  }

  it("copies the course's zoom_link/zoom_meeting_id onto the new batch", async () => {
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(
      courseRow({ zoom_link: 'https://zoom.us/j/82912345678', zoom_meeting_id: '82912345678' }),
    );
    coursesRepositoryMock.insertBatch.mockResolvedValue({
      id: 'batch-1',
      course_id: 'course-1',
      cohort_label: 'JUL-2026',
      course_fee: 1200,
      start_date: '2026-08-01',
      start_time: '09:00',
      end_date: '2026-08-05',
      zoom_link: 'https://zoom.us/j/82912345678',
      zoom_meeting_id: '82912345678',
      whatsapp_group_link: null,
      facilitator_name: 'Mr. Asante',
      facilitator_staff_id: null,
      welcome_email_enabled: true,
      payment_reminder_enabled: true,
      class_reminder_enabled: true,
      whatsapp_enabled: true,
      sms_enabled: true,
      is_active: true,
      discount_cutoff_date: null,
      discounted_fee: null,
    });

    const batch = await createBatch(validBatchInput());

    expect(coursesRepositoryMock.insertBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom_link: 'https://zoom.us/j/82912345678',
        zoom_meeting_id: '82912345678',
      }),
    );
    expect(batch.zoomLink).toBe('https://zoom.us/j/82912345678');
  });

  it('leaves the batch with null Zoom fields when the course has none and Zoom is not configured', async () => {
    zoomClientMock.isZoomMeetingCreateConfigured.mockReturnValue(false);
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(courseRow());
    coursesRepositoryMock.insertBatch.mockResolvedValue({
      id: 'batch-1',
      course_id: 'course-1',
      cohort_label: 'JUL-2026',
      course_fee: 1200,
      start_date: '2026-08-01',
      start_time: '09:00',
      end_date: '2026-08-05',
      zoom_link: null,
      zoom_meeting_id: null,
      whatsapp_group_link: null,
      facilitator_name: 'Mr. Asante',
      facilitator_staff_id: null,
      welcome_email_enabled: true,
      payment_reminder_enabled: true,
      class_reminder_enabled: true,
      whatsapp_enabled: true,
      sms_enabled: true,
      is_active: true,
      discount_cutoff_date: null,
      discounted_fee: null,
    });

    await createBatch(validBatchInput());

    expect(zoomClientMock.createZoomMeeting).not.toHaveBeenCalled();
    expect(coursesRepositoryMock.insertBatch).toHaveBeenCalledWith(
      expect.objectContaining({ zoom_link: null, zoom_meeting_id: null }),
    );
  });

  it('lazily creates the meeting on the first Batch when the course has none yet, and saves it back onto the course', async () => {
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(courseRow());
    zoomClientMock.createZoomMeeting.mockResolvedValue({
      meetingId: '82912345678',
      joinUrl: 'https://zoom.us/j/82912345678',
    });
    coursesRepositoryMock.insertBatch.mockResolvedValue({
      id: 'batch-1',
      course_id: 'course-1',
      cohort_label: 'JUL-2026',
      course_fee: 1200,
      start_date: '2026-08-01',
      start_time: '09:00',
      end_date: '2026-08-05',
      zoom_link: 'https://zoom.us/j/82912345678',
      zoom_meeting_id: '82912345678',
      whatsapp_group_link: null,
      facilitator_name: 'Mr. Asante',
      facilitator_staff_id: null,
      welcome_email_enabled: true,
      payment_reminder_enabled: true,
      class_reminder_enabled: true,
      whatsapp_enabled: true,
      sms_enabled: true,
      is_active: true,
      discount_cutoff_date: null,
      discounted_fee: null,
    });

    const batch = await createBatch(validBatchInput());

    expect(zoomClientMock.createZoomMeeting).toHaveBeenCalledWith(
      'AI-Powered Financial Reporting and Modeling',
    );
    expect(coursesRepositoryMock.updateCourseById).toHaveBeenCalledWith('course-1', {
      zoom_link: 'https://zoom.us/j/82912345678',
      zoom_meeting_id: '82912345678',
    });
    expect(coursesRepositoryMock.insertBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom_link: 'https://zoom.us/j/82912345678',
        zoom_meeting_id: '82912345678',
      }),
    );
    expect(batch.zoomLink).toBe('https://zoom.us/j/82912345678');
  });

  it('still creates the batch with null Zoom fields when the lazy Zoom create fails', async () => {
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(courseRow());
    zoomClientMock.createZoomMeeting.mockRejectedValue(new Error('Zoom down'));
    coursesRepositoryMock.insertBatch.mockResolvedValue({
      id: 'batch-1',
      course_id: 'course-1',
      cohort_label: 'JUL-2026',
      course_fee: 1200,
      start_date: '2026-08-01',
      start_time: '09:00',
      end_date: '2026-08-05',
      zoom_link: null,
      zoom_meeting_id: null,
      whatsapp_group_link: null,
      facilitator_name: 'Mr. Asante',
      facilitator_staff_id: null,
      welcome_email_enabled: true,
      payment_reminder_enabled: true,
      class_reminder_enabled: true,
      whatsapp_enabled: true,
      sms_enabled: true,
      is_active: true,
      discount_cutoff_date: null,
      discounted_fee: null,
    });

    const batch = await createBatch(validBatchInput());

    expect(coursesRepositoryMock.updateCourseById).not.toHaveBeenCalled();
    expect(batch.zoomLink).toBeNull();
  });
});
