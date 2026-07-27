// Business rules for the Course aggregate (Course + Batch + Email Templates).
import { AppError } from '@/lib/errors';
import * as coursesRepository from '@/modules/courses/repository';
// Permitted cross-module call: communications is the shared generic
// subdomain every module may use (Document 2, Section 9).
import { seedDefaultTemplatesForCourse } from '@/modules/communications/default-templates';
// Permitted cross-module call, same posture as communications — raising a
// Batch's capacity is one of the two real "a seat freed up" triggers
// (founder decision, 2026-07-24), the other being registrations'
// deleteRegistration.
import * as waitlistService from '@/modules/waitlist/service';
import { createZoomMeeting, isZoomMeetingCreateConfigured } from '@/lib/zoom/client';
import type {
  Batch,
  BatchInput,
  BatchUpdate,
  Course,
  CourseInput,
  CourseUpdate,
  PublicBatchOption,
} from '@/modules/courses/types';
import type { Database } from '@/lib/supabase/database.types';

type BatchRow = Database['public']['Tables']['batches']['Row'];

function toCourse(row: Database['public']['Tables']['courses']['Row']): Course {
  return {
    id: row.id,
    courseCode: row.course_code,
    courseName: row.course_name,
    certificateHours: row.certificate_hours,
    certificateDescription: row.certificate_description,
    cpdCredit: row.cpd_credit,
    certificateSerialFloor: row.certificate_serial_floor,
    zoomLink: row.zoom_link,
    zoomMeetingId: row.zoom_meeting_id,
    createdAt: row.created_at,
  };
}

function toBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    courseId: row.course_id,
    cohortLabel: row.cohort_label,
    capacity: row.capacity,
    courseFee: Number(row.course_fee),
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    zoomLink: row.zoom_link,
    zoomMeetingId: row.zoom_meeting_id,
    whatsappGroupLink: row.whatsapp_group_link,
    facilitatorName: row.facilitator_name,
    facilitatorStaffId: row.facilitator_staff_id,
    facilitatorTutorId: row.facilitator_tutor_id,
    welcomeEmailEnabled: row.welcome_email_enabled,
    paymentReminderEnabled: row.payment_reminder_enabled,
    classReminderEnabled: row.class_reminder_enabled,
    whatsappEnabled: row.whatsapp_enabled,
    smsEnabled: row.sms_enabled,
    isActive: row.is_active,
    discountCutoffDate: row.discount_cutoff_date,
    discountedFee: row.discounted_fee === null ? null : Number(row.discounted_fee),
  };
}

export async function getCourses(): Promise<Course[]> {
  const rows = await coursesRepository.selectCourses();
  return rows.map(toCourse);
}

export async function createCourse(input: CourseInput): Promise<Course> {
  // One persistent "classroom" Zoom meeting per Course (system review,
  // 2026-07-22) — every Batch inherits it, rather than each cohort getting
  // its own meeting. A Zoom failure must never block creating the course;
  // staff can set the link manually via course edit as a fallback.
  let zoomFields: { zoom_link: string | null; zoom_meeting_id: string | null } = {
    zoom_link: null,
    zoom_meeting_id: null,
  };
  if (isZoomMeetingCreateConfigured()) {
    try {
      const meeting = await createZoomMeeting(input.courseName);
      zoomFields = { zoom_link: meeting.joinUrl, zoom_meeting_id: meeting.meetingId };
    } catch (err) {
      console.error('[course zoom meeting create]', err);
    }
  }

  let row;
  try {
    row = await coursesRepository.insertCourse({
      course_code: input.courseCode,
      course_name: input.courseName,
      certificate_hours: input.certificateHours,
      certificate_description: input.certificateDescription,
      cpd_credit: input.cpdCredit,
      ...zoomFields,
    });
  } catch (err) {
    if (isPostgresUniqueViolation(err)) {
      throw new AppError(
        'DUPLICATE_COURSE_CODE',
        'A course with this code already exists.',
        409,
      );
    }
    throw err;
  }

  // A course without templates silently sends no email at all — seed the
  // defaults immediately so that failure mode cannot recur. A seeding error
  // must not fail course creation (the Messaging screen can recover).
  try {
    await seedDefaultTemplatesForCourse(row.id);
  } catch (err) {
    console.error('[course template seed]', err);
  }
  return toCourse(row);
}

export async function updateCourse(courseId: string, changes: CourseUpdate): Promise<Course> {
  const row = await coursesRepository.updateCourseById(courseId, {
    ...(changes.courseName !== undefined && { course_name: changes.courseName }),
    ...(changes.certificateHours !== undefined && {
      certificate_hours: changes.certificateHours,
    }),
    ...(changes.certificateDescription !== undefined && {
      certificate_description: changes.certificateDescription,
    }),
    ...(changes.cpdCredit !== undefined && { cpd_credit: changes.cpdCredit }),
    ...(changes.zoomLink !== undefined && { zoom_link: changes.zoomLink }),
    ...(changes.zoomMeetingId !== undefined && { zoom_meeting_id: changes.zoomMeetingId }),
  });
  return toCourse(row);
}

export async function getBatches(courseId?: string): Promise<Batch[]> {
  const rows = await coursesRepository.selectBatches(courseId);
  return rows.map(toBatch);
}

// Batches inherit the parent Course's Zoom meeting at creation time (system
// review, 2026-07-22) — no longer a per-batch manual field. If the course
// has no Zoom meeting yet (created before this existed, Zoom wasn't
// configured yet, or the course-creation call failed), lazily create it
// now on the course's first Batch and save it back onto the Course, so
// every later Batch of the same course reuses that same meeting.
export async function createBatch(input: BatchInput): Promise<Batch> {
  const course = await coursesRepository.selectCourseByIdSystem(input.courseId);
  let zoomLink = course?.zoom_link ?? null;
  let zoomMeetingId = course?.zoom_meeting_id ?? null;

  if (!zoomLink && !zoomMeetingId && course && isZoomMeetingCreateConfigured()) {
    try {
      const meeting = await createZoomMeeting(course.course_name);
      zoomLink = meeting.joinUrl;
      zoomMeetingId = meeting.meetingId;
      await coursesRepository.updateCourseById(course.id, {
        zoom_link: zoomLink,
        zoom_meeting_id: zoomMeetingId,
      });
    } catch (err) {
      console.error('[batch zoom meeting lazy create]', err);
    }
  }

  const row = await coursesRepository.insertBatch({
    ...toBatchInsert(input),
    zoom_link: zoomLink,
    zoom_meeting_id: zoomMeetingId,
  });
  return toBatch(row);
}

export async function updateBatch(batchId: string, changes: BatchUpdate): Promise<Batch> {
  const row = await coursesRepository.updateBatchById(batchId, {
    ...(changes.capacity !== undefined && { capacity: changes.capacity }),
    ...(changes.cohortLabel !== undefined && { cohort_label: changes.cohortLabel }),
    ...(changes.courseFee !== undefined && { course_fee: changes.courseFee }),
    ...(changes.startDate !== undefined && { start_date: changes.startDate }),
    ...(changes.startTime !== undefined && { start_time: changes.startTime }),
    ...(changes.endDate !== undefined && { end_date: changes.endDate }),
    ...(changes.whatsappGroupLink !== undefined && {
      whatsapp_group_link: changes.whatsappGroupLink,
    }),
    ...(changes.facilitatorName !== undefined && {
      facilitator_name: changes.facilitatorName,
    }),
    ...(changes.facilitatorStaffId !== undefined && {
      facilitator_staff_id: changes.facilitatorStaffId,
    }),
    ...(changes.facilitatorTutorId !== undefined && {
      facilitator_tutor_id: changes.facilitatorTutorId,
    }),
    ...(changes.welcomeEmailEnabled !== undefined && {
      welcome_email_enabled: changes.welcomeEmailEnabled,
    }),
    ...(changes.paymentReminderEnabled !== undefined && {
      payment_reminder_enabled: changes.paymentReminderEnabled,
    }),
    ...(changes.classReminderEnabled !== undefined && {
      class_reminder_enabled: changes.classReminderEnabled,
    }),
    ...(changes.whatsappEnabled !== undefined && {
      whatsapp_enabled: changes.whatsappEnabled,
    }),
    ...(changes.smsEnabled !== undefined && { sms_enabled: changes.smsEnabled }),
    ...(changes.isActive !== undefined && { is_active: changes.isActive }),
    ...(changes.discountCutoffDate !== undefined && {
      discount_cutoff_date: changes.discountCutoffDate,
    }),
    ...(changes.discountedFee !== undefined && { discounted_fee: changes.discountedFee }),
  });
  const batch = toBatch(row);

  // A capacity increase (or any other edit) may have freed a seat — cheap
  // to just always check rather than diff old vs new capacity, since
  // notifyNextIfSeatAvailable is itself a no-op when nothing changed or
  // no one is waiting. Non-blocking: a notification hiccup must never fail
  // the batch edit itself.
  if (batch.capacity !== null) {
    try {
      const seatsRemaining = await getSeatsRemaining(batchId);
      const course = await coursesRepository.selectCourseByIdSystem(batch.courseId);
      await waitlistService.notifyNextIfSeatAvailable(batchId, seatsRemaining, {
        courseName: course?.course_name ?? batch.cohortLabel,
        cohortLabel: batch.cohortLabel,
      });
    } catch (err) {
      console.error('[batch update waitlist notify]', err);
    }
  }

  return batch;
}

// Capacity check (waitlist feature, founder-approved 2026-07-24) — null
// means unlimited. Exposed to the registrations module (to decide
// register-vs-waitlist at submission time) and used internally above (to
// decide whether a batch edit freed a waitlist seat).
export async function getSeatsRemaining(batchId: string): Promise<number | null> {
  const batch = await coursesRepository.selectBatchByIdSystem(batchId);
  if (!batch || batch.capacity === null) return null;
  const usage = await coursesRepository.countRegistrationsByBatchIdsSystem([batchId]);
  return Math.max(batch.capacity - (usage.get(batchId) ?? 0), 0);
}

// Corporate seat reservation (founder-approved 2026-07-26) — a thin, silent
// capacity nudge with NONE of updateBatch's side effects (no audit-relevant
// change, no waitlist-notify). Used only by modules/corporate/service.ts to
// reserve seats at allocation-sale time and release them one at a time as
// employees fill in (net-zero change in public availability either way — a
// waitlist notification would be wrong here). Courses stays unaware that
// "corporate" exists; this is a generic primitive, not a corporate-specific
// hook. A genuine net increase in public availability (cancelling unfilled
// seats) goes through the real updateBatch instead, deliberately, so the
// existing waitlist-notify side effect fires exactly when it should.
export async function adjustBatchCapacityInternal(batchId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const batch = await coursesRepository.selectBatchByIdSystem(batchId);
  if (!batch || batch.capacity === null) return;
  await coursesRepository.updateBatchById(batchId, {
    capacity: Math.max(batch.capacity + delta, 0),
  });
}

// BR-19: the public registration form only lists Active batches with a
// start date of today or later.
export async function getActiveBatchesForPublicForm(): Promise<PublicBatchOption[]> {
  const rows = await coursesRepository.selectActiveFutureBatchesPublic();
  const usage = await coursesRepository.countRegistrationsByBatchIdsSystem(rows.map((row) => row.id));
  return rows.map((row) => {
    const registered = usage.get(row.id) ?? 0;
    const seatsRemaining = row.capacity === null ? null : Math.max(row.capacity - registered, 0);
    return {
    batchId: row.id,
    courseName: row.courses?.course_name ?? '',
    cohortLabel: row.cohort_label,
    startDate: row.start_date,
    courseFee: Number(row.course_fee),
    capacity: row.capacity,
    seatsRemaining,
    isFull: seatsRemaining !== null && seatsRemaining <= 0,
    discountCutoffDate: row.discount_cutoff_date,
    discountedFee: row.discounted_fee === null ? null : Number(row.discounted_fee),
    };
  });
}

// Exposed to the registrations module for BR-01 validation and fee copy.
export async function getBatchByIdSystem(batchId: string): Promise<Batch | null> {
  const row = await coursesRepository.selectBatchByIdSystem(batchId);
  return row ? toBatch(row) : null;
}

// Exposed to the registrations module for the confirmation message, which
// names the Course, not the Batch (Document 1, Section F1.01 step 5).
export async function getCourseByIdSystem(courseId: string): Promise<Course | null> {
  const row = await coursesRepository.selectCourseByIdSystem(courseId);
  return row ? toCourse(row) : null;
}

function toBatchInsert(input: BatchInput): Database['public']['Tables']['batches']['Insert'] {
  return {
    course_id: input.courseId,
    cohort_label: input.cohortLabel,
    capacity: input.capacity ?? null,
    course_fee: input.courseFee,
    start_date: input.startDate,
    start_time: input.startTime,
    end_date: input.endDate,
    whatsapp_group_link: input.whatsappGroupLink ?? null,
    facilitator_name: input.facilitatorName,
    facilitator_staff_id: input.facilitatorStaffId ?? null,
    facilitator_tutor_id: input.facilitatorTutorId ?? null,
    welcome_email_enabled: input.welcomeEmailEnabled,
    payment_reminder_enabled: input.paymentReminderEnabled,
    class_reminder_enabled: input.classReminderEnabled,
    whatsapp_enabled: input.whatsappEnabled,
    sms_enabled: input.smsEnabled,
    is_active: input.isActive,
    discount_cutoff_date: input.discountCutoffDate ?? null,
    discounted_fee: input.discountedFee ?? null,
  };
}

export function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

