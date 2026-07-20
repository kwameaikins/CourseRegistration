// Business rules for the Course aggregate (Course + Batch + Email Templates).
import { AppError } from '@/lib/errors';
import * as coursesRepository from '@/modules/courses/repository';
// Permitted cross-module call: communications is the shared generic
// subdomain every module may use (Document 2, Section 9).
import { seedDefaultTemplatesForCourse } from '@/modules/communications/default-templates';
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
    createdAt: row.created_at,
  };
}

function toBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    courseId: row.course_id,
    cohortLabel: row.cohort_label,
    courseFee: Number(row.course_fee),
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    zoomLink: row.zoom_link,
    zoomMeetingId: row.zoom_meeting_id,
    whatsappGroupLink: row.whatsapp_group_link,
    facilitatorName: row.facilitator_name,
    facilitatorStaffId: row.facilitator_staff_id,
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
  let row;
  try {
    row = await coursesRepository.insertCourse({
      course_code: input.courseCode,
      course_name: input.courseName,
      certificate_hours: input.certificateHours,
      certificate_description: input.certificateDescription,
      cpd_credit: input.cpdCredit,
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
  });
  return toCourse(row);
}

export async function getBatches(courseId?: string): Promise<Batch[]> {
  const rows = await coursesRepository.selectBatches(courseId);
  return rows.map(toBatch);
}

export async function createBatch(input: BatchInput): Promise<Batch> {
  const row = await coursesRepository.insertBatch(toBatchInsert(input));
  return toBatch(row);
}

export async function updateBatch(batchId: string, changes: BatchUpdate): Promise<Batch> {
  const row = await coursesRepository.updateBatchById(batchId, {
    ...(changes.cohortLabel !== undefined && { cohort_label: changes.cohortLabel }),
    ...(changes.courseFee !== undefined && { course_fee: changes.courseFee }),
    ...(changes.startDate !== undefined && { start_date: changes.startDate }),
    ...(changes.startTime !== undefined && { start_time: changes.startTime }),
    ...(changes.endDate !== undefined && { end_date: changes.endDate }),
    ...(changes.zoomLink !== undefined && { zoom_link: changes.zoomLink }),
    ...(changes.zoomMeetingId !== undefined && { zoom_meeting_id: changes.zoomMeetingId }),
    ...(changes.whatsappGroupLink !== undefined && {
      whatsapp_group_link: changes.whatsappGroupLink,
    }),
    ...(changes.facilitatorName !== undefined && {
      facilitator_name: changes.facilitatorName,
    }),
    ...(changes.facilitatorStaffId !== undefined && {
      facilitator_staff_id: changes.facilitatorStaffId,
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
  return toBatch(row);
}

// BR-19: the public registration form only lists Active batches with a
// start date of today or later.
export async function getActiveBatchesForPublicForm(): Promise<PublicBatchOption[]> {
  const rows = await coursesRepository.selectActiveFutureBatchesPublic();
  return rows.map((row) => ({
    batchId: row.id,
    courseName: row.courses?.course_name ?? '',
    cohortLabel: row.cohort_label,
    startDate: row.start_date,
    courseFee: Number(row.course_fee),
    discountCutoffDate: row.discount_cutoff_date,
    discountedFee: row.discounted_fee === null ? null : Number(row.discounted_fee),
  }));
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
    course_fee: input.courseFee,
    start_date: input.startDate,
    start_time: input.startTime,
    end_date: input.endDate,
    zoom_link: input.zoomLink ?? null,
    zoom_meeting_id: input.zoomMeetingId ?? null,
    whatsapp_group_link: input.whatsappGroupLink ?? null,
    facilitator_name: input.facilitatorName,
    facilitator_staff_id: input.facilitatorStaffId ?? null,
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
