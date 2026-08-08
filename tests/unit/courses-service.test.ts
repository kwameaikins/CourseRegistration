import { beforeEach, describe, expect, it, vi } from 'vitest';

const coursesRepositoryMock = {
  insertCourse: vi.fn(),
  updateCourseById: vi.fn(),
  selectBatches: vi.fn(),
  insertBatch: vi.fn(),
  updateBatchById: vi.fn(),
  selectCourseByIdSystem: vi.fn(),
  selectBatchByIdSystem: vi.fn(),
  countRegistrationsByBatchIdsSystem: vi.fn(),
};
const seedDefaultTemplatesForCourseMock = vi.fn();
const zoomClientMock = {
  createZoomMeeting: vi.fn(),
  createBatchClassroomMeeting: vi.fn(),
  isZoomMeetingCreateConfigured: vi.fn(),
};
const waitlistServiceMock = {
  notifyNextIfSeatAvailable: vi.fn(),
};
// Course and Batch writes gate on requireRole; mocking the users service
// keeps these tests off lib/supabase (and out of a request scope).
const usersServiceMock = { requireRole: vi.fn() };

vi.mock('@/modules/courses/repository', () => coursesRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/communications/default-templates', () => ({
  seedDefaultTemplatesForCourse: (...args: unknown[]) => seedDefaultTemplatesForCourseMock(...args),
}));
vi.mock('@/lib/zoom/client', () => zoomClientMock);
vi.mock('@/modules/waitlist/service', () => waitlistServiceMock);

const {
  createCourse,
  createBatch,
  updateBatch,
  getBatches,
  getSeatsRemaining,
  adjustBatchCapacityInternal,
  offerNextWaitlistSeat,
} = await import('@/modules/courses/service');

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
  usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
  seedDefaultTemplatesForCourseMock.mockResolvedValue(1);
  zoomClientMock.isZoomMeetingCreateConfigured.mockReturnValue(true);
  coursesRepositoryMock.insertCourse.mockResolvedValue(courseRow());
  waitlistServiceMock.notifyNextIfSeatAvailable.mockResolvedValue(undefined);
});

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    course_id: 'course-1',
    cohort_label: 'JUL-2026',
    capacity: null,
    course_fee: 1200,
    start_date: '2026-08-01',
    start_time: '09:00',
    end_date: '2026-08-05',
    zoom_link: null,
    zoom_meeting_id: null,
    whatsapp_group_link: null,
    resources_link: null,
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
    ...overrides,
  };
}

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
      isFree: false,
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

  // Time-boxed classroom (founder-flagged 2026-08-08). A batch that records
  // when it actually meets gets its OWN fixed-time meeting instead of the
  // course's shared type 3 room, which Zoom leaves joinable at any hour.
  it('creates a per-batch classroom when the batch records a full schedule', async () => {
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(
      courseRow({ zoom_link: 'https://zoom.us/j/shared', zoom_meeting_id: 'shared-id' }),
    );
    zoomClientMock.createBatchClassroomMeeting.mockResolvedValue({
      meetingId: 'batch-meeting-id',
      joinUrl: 'https://zoom.us/j/batch-meeting',
    });
    coursesRepositoryMock.insertBatch.mockResolvedValue(batchRow());

    await createBatch({ ...validBatchInput(), endTime: '12:00', meetingDays: [1, 7] });

    expect(zoomClientMock.createBatchClassroomMeeting).toHaveBeenCalledWith(
      expect.objectContaining({ endTime: '12:00', meetingDays: [1, 7] }),
    );
    // The batch's own room wins over the inherited one.
    expect(coursesRepositoryMock.insertBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom_link: 'https://zoom.us/j/batch-meeting',
        zoom_meeting_id: 'batch-meeting-id',
        end_time: '12:00',
        meeting_days: [1, 7],
      }),
    );
    expect(zoomClientMock.createZoomMeeting).not.toHaveBeenCalled();
  });

  // An always-open room is a smaller problem than a recurrence that ends
  // mid-course and locks students out of their own classes.
  it('falls back to the shared course room when the classroom create fails', async () => {
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(
      courseRow({ zoom_link: 'https://zoom.us/j/shared', zoom_meeting_id: 'shared-id' }),
    );
    zoomClientMock.createBatchClassroomMeeting.mockRejectedValue(
      new Error('above Zoom 50-occurrence limit'),
    );
    coursesRepositoryMock.insertBatch.mockResolvedValue(batchRow());

    await createBatch({ ...validBatchInput(), endTime: '12:00', meetingDays: [2, 3, 4, 5, 6] });

    expect(coursesRepositoryMock.insertBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom_link: 'https://zoom.us/j/shared',
        zoom_meeting_id: 'shared-id',
      }),
    );
  });

  it('leaves a batch with no recorded schedule on the shared course room', async () => {
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(
      courseRow({ zoom_link: 'https://zoom.us/j/shared', zoom_meeting_id: 'shared-id' }),
    );
    coursesRepositoryMock.insertBatch.mockResolvedValue(batchRow());

    await createBatch(validBatchInput());

    expect(zoomClientMock.createBatchClassroomMeeting).not.toHaveBeenCalled();
    expect(coursesRepositoryMock.insertBatch).toHaveBeenCalledWith(
      expect.objectContaining({ end_time: null, meeting_days: null }),
    );
  });

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

describe('resourcesLink — course materials link (founder-approved 2026-07-28)', () => {
  function validBatchInput(overrides: Record<string, unknown> = {}) {
    return {
      courseId: 'course-1',
      cohortLabel: 'JUL-2026',
      courseFee: 1200,
      isFree: false,
      startDate: '2026-08-01',
      startTime: '09:00',
      endDate: '2026-08-05',
      whatsappGroupLink: null,
      resourcesLink: 'https://drive.google.com/folder/xyz',
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
      ...overrides,
    };
  }

  it('createBatch writes resourcesLink through to resources_link', async () => {
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(courseRow());
    coursesRepositoryMock.insertBatch.mockResolvedValue(
      batchRow({ resources_link: 'https://drive.google.com/folder/xyz' }),
    );

    const batch = await createBatch(validBatchInput());

    expect(coursesRepositoryMock.insertBatch).toHaveBeenCalledWith(
      expect.objectContaining({ resources_link: 'https://drive.google.com/folder/xyz' }),
    );
    expect(batch.resourcesLink).toBe('https://drive.google.com/folder/xyz');
  });

  it('updateBatch only writes resourcesLink when the field is actually touched', async () => {
    coursesRepositoryMock.updateBatchById.mockResolvedValue(batchRow());
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow());

    await updateBatch('batch-1', { cohortLabel: 'AUG-2026' });

    expect(coursesRepositoryMock.updateBatchById).toHaveBeenCalledWith(
      'batch-1',
      expect.not.objectContaining({ resources_link: expect.anything() }),
    );
  });
});

describe('getSeatsRemaining — batch capacity check (founder-approved 2026-07-24)', () => {
  it('returns null (unlimited) when the batch has no capacity set', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: null }));
    const result = await getSeatsRemaining('batch-1');
    expect(result).toBeNull();
    expect(coursesRepositoryMock.countRegistrationsByBatchIdsSystem).not.toHaveBeenCalled();
  });

  it('subtracts active registrations from capacity', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: 30 }));
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-1', 22]]),
    );
    expect(await getSeatsRemaining('batch-1')).toBe(8);
  });

  it('never goes negative when over-enrolled', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: 10 }));
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-1', 15]]),
    );
    expect(await getSeatsRemaining('batch-1')).toBe(0);
  });
});

describe('adjustBatchCapacityInternal — silent corporate seat reservation nudge (2026-07-26)', () => {
  it('adjusts capacity by the given delta with no waitlist-notify side effect', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: 30 }));
    coursesRepositoryMock.updateBatchById.mockResolvedValue(batchRow({ capacity: 25 }));

    await adjustBatchCapacityInternal('batch-1', -5);

    expect(coursesRepositoryMock.updateBatchById).toHaveBeenCalledWith('batch-1', { capacity: 25 });
    expect(waitlistServiceMock.notifyNextIfSeatAvailable).not.toHaveBeenCalled();
  });

  it('never drops capacity below zero', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: 3 }));
    await adjustBatchCapacityInternal('batch-1', -10);
    expect(coursesRepositoryMock.updateBatchById).toHaveBeenCalledWith('batch-1', { capacity: 0 });
  });

  it('is a no-op for an unlimited-capacity batch', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: null }));
    await adjustBatchCapacityInternal('batch-1', -5);
    expect(coursesRepositoryMock.updateBatchById).not.toHaveBeenCalled();
  });

  it('is a no-op for a zero delta', async () => {
    await adjustBatchCapacityInternal('batch-1', 0);
    expect(coursesRepositoryMock.selectBatchByIdSystem).not.toHaveBeenCalled();
  });
});

describe('offerNextWaitlistSeat — manual trigger (Admin Assistant tool, 2026-07-27)', () => {
  it('returns not-offered when the batch does not exist', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(null);

    const result = await offerNextWaitlistSeat('batch-missing');

    expect(result).toEqual({ offered: false });
    expect(waitlistServiceMock.notifyNextIfSeatAvailable).not.toHaveBeenCalled();
  });

  it('delegates to the same notify path updateBatch already uses, with the current seat count', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: 30 }));
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-1', 20]]),
    );
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(courseRow());
    waitlistServiceMock.notifyNextIfSeatAvailable.mockResolvedValue({
      offered: true,
      participantName: 'Ama Owusu',
    });

    const result = await offerNextWaitlistSeat('batch-1');

    expect(waitlistServiceMock.notifyNextIfSeatAvailable).toHaveBeenCalledWith(
      'batch-1',
      10,
      expect.objectContaining({ cohortLabel: 'JUL-2026' }),
    );
    expect(result).toEqual({ offered: true, participantName: 'Ama Owusu' });
  });
});

describe('updateBatch — capacity write-through and waitlist notification', () => {
  beforeEach(() => {
    coursesRepositoryMock.updateBatchById.mockResolvedValue(batchRow({ capacity: 30 }));
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue(batchRow({ capacity: 30 }));
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-1', 20]]),
    );
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(courseRow());
  });

  it('actually writes a capacity change through to the repository (regression: this used to be silently dropped)', async () => {
    await updateBatch('batch-1', { capacity: 30 });
    expect(coursesRepositoryMock.updateBatchById).toHaveBeenCalledWith(
      'batch-1',
      expect.objectContaining({ capacity: 30 }),
    );
  });

  it('checks for a freed waitlist seat after any edit to a capacity-limited batch', async () => {
    await updateBatch('batch-1', { cohortLabel: 'AUG-2026' });
    expect(waitlistServiceMock.notifyNextIfSeatAvailable).toHaveBeenCalledWith(
      'batch-1',
      10,
      expect.objectContaining({ cohortLabel: 'JUL-2026' }),
    );
  });

  it('skips the waitlist check entirely for an unlimited-capacity batch', async () => {
    coursesRepositoryMock.updateBatchById.mockResolvedValue(batchRow({ capacity: null }));
    await updateBatch('batch-1', { cohortLabel: 'AUG-2026' });
    expect(waitlistServiceMock.notifyNextIfSeatAvailable).not.toHaveBeenCalled();
  });

  it('still returns the updated batch even if the waitlist notification fails', async () => {
    waitlistServiceMock.notifyNextIfSeatAvailable.mockRejectedValue(new Error('resend down'));
    const batch = await updateBatch('batch-1', { cohortLabel: 'AUG-2026' });
    expect(batch.id).toBe('batch-1');
  });
});

describe('authorization — Course and Batch entry points', () => {
  // The courses repository runs on the service-role client, so RLS does not
  // backstop these. The routes gate too; this is the second layer, and it is
  // the only one the Admin Assistant tool registry passes through.
  const ALL_STAFF = ['admin', 'finance', 'marketing', 'management'];

  it('opens batch reads to every staff role, matching the pickers that use them', async () => {
    coursesRepositoryMock.selectBatches.mockResolvedValue([]);
    await getBatches();
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(ALL_STAFF);
  });

  it('restricts course creation to admin', async () => {
    zoomClientMock.isZoomMeetingCreateConfigured.mockReturnValue(false);
    await createCourse({ courseCode: 'AI05', courseName: 'AI Reporting' } as never);
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('restricts batch creation to admin', async () => {
    zoomClientMock.isZoomMeetingCreateConfigured.mockReturnValue(false);
    coursesRepositoryMock.selectCourseByIdSystem.mockResolvedValue(courseRow());
    coursesRepositoryMock.insertBatch.mockResolvedValue({
      id: 'batch-1',
      course_id: 'course-1',
      cohort_label: 'Aug 2026',
      start_date: '2026-08-01',
      end_date: '2026-08-30',
      course_fee: 1000,
      capacity: null,
      is_active: true,
      zoom_link: null,
      zoom_meeting_id: null,
      resources_link: null,
      created_at: '2026-07-01T00:00:00Z',
    });
    await createBatch({ courseId: 'course-1', cohortLabel: 'Aug 2026' } as never);
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  // updateBatch is intentionally left ungated in the service: corporate calls
  // it when cancelling an allocation (a finance-permitted action) and needs
  // the waitlist-notify side effect. An ['admin'] gate here would break that.
  it('leaves updateBatch ungated so the corporate cancellation path still works', async () => {
    coursesRepositoryMock.selectBatchByIdSystem.mockResolvedValue({
      id: 'batch-1',
      capacity: 10,
    });
    coursesRepositoryMock.updateBatchById.mockResolvedValue({
      id: 'batch-1',
      course_id: 'course-1',
      cohort_label: 'Aug 2026',
      start_date: '2026-08-01',
      end_date: '2026-08-30',
      course_fee: 1000,
      capacity: 12,
      is_active: true,
      zoom_link: null,
      zoom_meeting_id: null,
      resources_link: null,
      created_at: '2026-07-01T00:00:00Z',
    });
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(new Map());

    await updateBatch('batch-1', { capacity: 12 });
    expect(usersServiceMock.requireRole).not.toHaveBeenCalled();
  });
});
