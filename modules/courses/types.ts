import { z } from 'zod';

export interface Course {
  id: string;
  courseCode: string;
  courseName: string;
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
  whatsappGroupLink: string | null;
  facilitatorName: string;
  facilitatorStaffId: string | null;
  welcomeEmailEnabled: boolean;
  paymentReminderEnabled: boolean;
  classReminderEnabled: boolean;
  whatsappEnabled: boolean;
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
    zoomLink: httpsUrl,
    whatsappGroupLink: httpsUrl,
    facilitatorName: z.string().trim().min(2),
    facilitatorStaffId: z.uuid().nullable().optional(),
    welcomeEmailEnabled: z.boolean().default(true),
    paymentReminderEnabled: z.boolean().default(true),
    classReminderEnabled: z.boolean().default(true),
    whatsappEnabled: z.boolean().default(true),
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
    zoomLink: httpsUrl,
    whatsappGroupLink: httpsUrl,
    facilitatorName: z.string().trim().min(2).optional(),
    facilitatorStaffId: z.uuid().nullable().optional(),
    welcomeEmailEnabled: z.boolean().optional(),
    paymentReminderEnabled: z.boolean().optional(),
    classReminderEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
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
