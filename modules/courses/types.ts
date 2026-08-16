import { z } from 'zod';

import type { CoursePublicContent } from '@/modules/courses/public-content';

export interface Course {
  id: string;
  courseCode: string;
  courseName: string;
  // Certificate metadata (Doc review 2026-07-20): set once per course,
  // prefilled into batch issuance instead of retyped per run.
  certificateHours: number;
  certificateDescription: string;
  cpdCredit: string;
  // Highest 2026 serial already used per the legacy AppScript counter.
  certificateSerialFloor: number;
  // Persistent "classroom" Zoom meeting (system review, 2026-07-22):
  // auto-created once per Course; every Batch inherits it at creation time
  // rather than each cohort getting its own meeting. Editable here as a
  // manual fallback if auto-create failed or wasn't configured yet.
  zoomLink: string | null;
  zoomMeetingId: string | null;
  createdAt: string;
}

export interface Batch {
  id: string;
  courseId: string;
  cohortLabel: string;
  capacity: number | null;
  courseFee: number;
  // Free event / webinar (founder request 2026-08-03): no fee is ever
  // charged, registrants are confirmed on sign-up. Requires courseFee 0 and
  // no early-registration discount. Deliberately distinct from a paid Batch
  // whose fee reached zero for one person via a code discount or a staff
  // waiver — those still count as revenue-bearing.
  isFree: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  // Class schedule (2026-08-08). Null on batches created before it existed —
  // those keep the Course's always-open classroom. Set together, they earn
  // the batch its own Zoom meeting that opens 15 minutes before each session.
  // meetingDays uses Zoom's encoding: 1 = Sunday ... 7 = Saturday.
  endTime: string | null;
  meetingDays: number[] | null;
  zoomLink: string | null;
  // Numeric Zoom meeting ID (registration-required meeting) — enables
  // personal join links and attendance sync when set.
  zoomMeetingId: string | null;
  whatsappGroupLink: string | null;
  // Link to course materials/slides (founder-approved 2026-07-28) — same
  // shape as zoomLink/whatsappGroupLink rather than building file storage.
  resourcesLink: string | null;
  facilitatorName: string;
  facilitatorStaffId: string | null;
  // The tutor assigned to this batch (external party — see
  // modules/tutors). facilitatorStaffId is a legacy staff-role field, kept
  // for now but no longer written to by new code (2026-07-27).
  facilitatorTutorId: string | null;
  welcomeEmailEnabled: boolean;
  paymentReminderEnabled: boolean;
  classReminderEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  isActive: boolean;
  // Early-registration discount (Document 5 addendum, 2026-07-18): a
  // registrant on or before discountCutoffDate pays discountedFee instead
  // of courseFee. Both are null together when no discount applies.
  discountCutoffDate: string | null;
  discountedFee: number | null;
}

// Batch option shown on the public registration form (BR-19) — deliberately
// excludes internal fields like links and facilitator details.
export interface PublicBatchOption {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  // Late registration (2026-08-12): the window runs to endDate, so a listed
  // batch may already be under way. hasStarted is derived at read time from
  // startDate, never stored — it changes meaning every midnight.
  endDate: string;
  hasStarted: boolean;
  courseFee: number;
  isFree: boolean;
  capacity: number | null;
  seatsRemaining: number | null;
  isFull: boolean;
  discountCutoffDate: string | null;
  discountedFee: number | null;
}

export const courseInputSchema = z.object({
  courseCode: z.string().trim().min(2),
  courseName: z.string().trim().min(2),
  certificateHours: z.number().int().min(0).max(1000).default(0),
  certificateDescription: z.string().trim().max(600).default(''),
  cpdCredit: z.string().trim().max(50).default('TBD'),
});

const httpsUrl = z
  .string()
  .trim()
  .refine((value) => value === '' || value.startsWith('https://'), {
    message: 'Link must start with https://',
  })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

// Zoom meeting IDs are 9–11 digits, often typed with spaces (e.g. "829 XXX").
const zoomMeetingIdField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^[\d ]{9,15}$/.test(value), {
    message: 'Zoom Meeting ID must be the numeric meeting ID',
  })
  .transform((value) => {
    const digits = value.replace(/\s/g, '');
    return digits === '' ? null : digits;
  })
  .nullable()
  .optional();

// course_code is immutable — it is baked into issued certificate numbers.
export const courseUpdateSchema = z.object({
  courseName: z.string().trim().min(2).optional(),
  certificateHours: z.number().int().min(0).max(1000).optional(),
  certificateDescription: z.string().trim().max(600).optional(),
  cpdCredit: z.string().trim().max(50).optional(),
  // Manual fallback/override for the auto-created course meeting.
  zoomLink: httpsUrl,
  zoomMeetingId: zoomMeetingIdField,
});

export type CourseUpdate = z.infer<typeof courseUpdateSchema>;

// Same wrapping order as httpsUrl above: transform runs only for a present
// value, so an omitted key stays `undefined` (batchUpdateSchema's "field not
// touched by this PATCH" signal) while an explicit null or empty string
// becomes `null` ("clear the discount").
const discountCutoffDateField = z
  .string()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Discount Cutoff Date must be a valid date (YYYY-MM-DD)',
  })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();
const discountedFeeField = z.number().min(0).nullable().optional();

export const batchInputSchema = z
  .object({
    courseId: z.uuid(),
    cohortLabel: z.string().trim().min(1),
    capacity: z.number().int().positive().nullable().optional(),
    courseFee: z.number().min(0),
    isFree: z.boolean().default(false),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Class schedule (2026-08-08). Both optional: a batch without them still
    // works exactly as before, inheriting the Course's always-open classroom.
    // Supplying BOTH is what earns a time-boxed Zoom meeting that only opens
    // 15 minutes before each session — see createBatchClassroomMeeting.
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .nullable()
      .optional(),
    // Zoom's weekly_days encoding, stored and sent verbatim: 1 = Sunday ...
    // 7 = Saturday.
    meetingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).nullable().optional(),
    whatsappGroupLink: httpsUrl,
    resourcesLink: httpsUrl,
    facilitatorName: z.string().trim().min(2),
    facilitatorStaffId: z.uuid().nullable().optional(),
    facilitatorTutorId: z.uuid().nullable().optional(),
    welcomeEmailEnabled: z.boolean().default(true),
    paymentReminderEnabled: z.boolean().default(true),
    classReminderEnabled: z.boolean().default(true),
    whatsappEnabled: z.boolean().default(true),
    smsEnabled: z.boolean().default(true),
    isActive: z.boolean().default(true),
    discountCutoffDate: discountCutoffDateField,
    discountedFee: discountedFeeField,
  })
  .refine((batch) => batch.startDate <= batch.endDate, {
    message: 'Start Date must be on or before End Date',
    path: ['startDate'],
  })
  .refine(
    (batch) => !batch.endTime || batch.endTime > batch.startTime,
    { message: 'End Time must be after Start Time', path: ['endTime'] },
  )
  // Half a schedule is worse than none: an end time with no meeting days (or
  // the reverse) cannot produce a Zoom recurrence, and silently falling back
  // would leave staff believing they had set a join window when they had not.
  .refine(
    (batch) => Boolean(batch.endTime) === Boolean(batch.meetingDays?.length),
    {
      message: 'Set both the class End Time and the days the cohort meets, or neither',
      path: ['meetingDays'],
    },
  )
  .refine(
    (batch) => {
      const cutoff = batch.discountCutoffDate ?? null;
      const fee = batch.discountedFee ?? null;
      return (cutoff === null) === (fee === null);
    },
    { message: 'Discount Cutoff Date and Discounted Fee must be set together', path: ['discountedFee'] },
  )
  .refine(
    (batch) => {
      const fee = batch.discountedFee ?? null;
      return fee === null || fee <= batch.courseFee;
    },
    { message: 'Discounted Fee must not exceed the Course Fee', path: ['discountedFee'] },
  )
  // Mirrors the free_batch_has_no_fee DB constraint (202608030048) so the
  // staff form reports it as a field error instead of a 500 from Postgres.
  .refine((batch) => !batch.isFree || batch.courseFee === 0, {
    message: 'A free event cannot have a course fee',
    path: ['courseFee'],
  })
  .refine((batch) => !batch.isFree || (batch.discountedFee ?? null) === null, {
    message: 'A free event cannot have an early-registration discount',
    path: ['discountedFee'],
  });

export const batchUpdateSchema = z
  .object({
    cohortLabel: z.string().trim().min(1).optional(),
    capacity: z.number().int().positive().nullable().optional(),
    courseFee: z.number().min(0).optional(),
    // Same partial-PATCH caveat as the discount fields below: flipping a
    // Batch to free without also sending courseFee: 0 in the same body is
    // caught by the free_batch_has_no_fee DB constraint, not here.
    isFree: z.boolean().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    whatsappGroupLink: httpsUrl,
    resourcesLink: httpsUrl,
    facilitatorName: z.string().trim().min(2).optional(),
    facilitatorStaffId: z.uuid().nullable().optional(),
    facilitatorTutorId: z.uuid().nullable().optional(),
    welcomeEmailEnabled: z.boolean().optional(),
    paymentReminderEnabled: z.boolean().optional(),
    classReminderEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    // Paired-nullability and discountedFee<=courseFee are DB-enforced
    // (discount_fields_set_together, discounted_fee_below_course_fee) —
    // a PATCH may legitimately touch only one field (e.g. extend the
    // cutoff date), so that invariant cannot be checked from a partial body.
    discountCutoffDate: discountCutoffDateField,
    discountedFee: discountedFeeField,
  })
  .refine(
    (batch) => !batch.startDate || !batch.endDate || batch.startDate <= batch.endDate,
    { message: 'Start Date must be on or before End Date', path: ['startDate'] },
  )
  .refine((batch) => batch.isFree !== true || batch.courseFee === undefined || batch.courseFee === 0, {
    message: 'A free event cannot have a course fee',
    path: ['courseFee'],
  });

export type CourseInput = z.infer<typeof courseInputSchema>;
export type BatchInput = z.infer<typeof batchInputSchema>;
export type BatchUpdate = z.infer<typeof batchUpdateSchema>;

// ---------------------------------------------------------------------------
// Staff-editable course copy (2026-08-16)
// ---------------------------------------------------------------------------
// course_content.body is jsonb and the database does not constrain its shape,
// so this schema IS the constraint. It is annotated with the interface the
// programme page actually renders (CoursePublicContent), which means the two
// cannot drift: change the rendered shape without changing this and the
// annotation stops compiling.
//
// Deliberately permissive about emptiness. Every optional section on the
// programme page is guarded by a `.length > 0` check, and an empty array is a
// real editorial choice ("this course has no prerequisites"), not a mistake.
// Only the fields the page renders unconditionally are required to be
// non-empty.

const trimmedLine = z.string().trim().min(1);

const courseCurriculumSessionSchema = z.object({
  heading: trimmedLine,
  title: trimmedLine,
  points: z.array(trimmedLine),
  practical: trimmedLine.optional(),
});

export const courseContentBodySchema: z.ZodType<CoursePublicContent> = z.object({
  briefSlug: z.string().trim(),
  tagline: trimmedLine,
  heroImage: z.string().trim().nullable(),
  overview: z.array(trimmedLine),
  idealFor: z.string().trim(),
  primaryAudience: z.array(trimmedLine),
  alsoSuitableFor: z.array(trimmedLine),
  outcomesLabel: trimmedLine,
  outcomes: z.array(trimmedLine),
  curriculum: z.array(courseCurriculumSessionSchema),
  format: z.array(z.object({ label: trimmedLine, value: trimmedLine })),
  prerequisites: z.array(trimmedLine),
  // The one list the page renders without a guard, so it must not be empty.
  includes: z.array(trimmedLine).min(1),
  facilitator: z.object({
    name: z.string().trim(),
    credentials: z.string().trim().nullable(),
  }),
  faq: z.array(z.object({ question: trimmedLine, answer: trimmedLine })),
  corporateNote: z.string().trim().nullable(),
});

export const courseContentSaveSchema = z.object({
  body: courseContentBodySchema,
  // Null clears the override and returns the course to the code map's order.
  displayOrder: z.number().int().min(0).max(9999).nullable().optional(),
});

export type CourseContentSave = z.infer<typeof courseContentSaveSchema>;

export interface CourseContentRecord {
  courseId: string;
  courseCode: string;
  courseName: string;
  body: CoursePublicContent;
  displayOrder: number | null;
  updatedAt: string | null;
  // Null when the course has no row yet and is still rendering from the
  // hard-coded map — the editor shows this as "from code" so staff can tell
  // the difference between copy nobody has ever edited and copy someone saved.
  source: 'database' | 'code' | 'none';
}


