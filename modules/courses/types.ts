import { z } from 'zod';

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
  courseFee: number;
  startDate: string;
  startTime: string;
  endDate: string;
  zoomLink: string | null;
  // Numeric Zoom meeting ID (registration-required meeting) — enables
  // personal join links and attendance sync when set.
  zoomMeetingId: string | null;
  whatsappGroupLink: string | null;
  facilitatorName: string;
  facilitatorStaffId: string | null;
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
  courseFee: number;
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
    courseFee: z.number().min(0),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    whatsappGroupLink: httpsUrl,
    facilitatorName: z.string().trim().min(2),
    facilitatorStaffId: z.uuid().nullable().optional(),
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
  );

export const batchUpdateSchema = z
  .object({
    cohortLabel: z.string().trim().min(1).optional(),
    courseFee: z.number().min(0).optional(),
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
    facilitatorName: z.string().trim().min(2).optional(),
    facilitatorStaffId: z.uuid().nullable().optional(),
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
  );

export type CourseInput = z.infer<typeof courseInputSchema>;
export type BatchInput = z.infer<typeof batchInputSchema>;
export type BatchUpdate = z.infer<typeof batchUpdateSchema>;
