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
}

// Batch option shown on the public registration form (BR-19) — deliberately
// excludes internal fields like links and facilitator details.
export interface PublicBatchOption {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  courseFee: number;
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
  })
  .refine((batch) => batch.startDate <= batch.endDate, {
    message: 'Start Date must be on or before End Date',
    path: ['startDate'],
  });

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
  })
  .refine(
    (batch) => !batch.startDate || !batch.endDate || batch.startDate <= batch.endDate,
    { message: 'Start Date must be on or before End Date', path: ['startDate'] },
  );

export type CourseInput = z.infer<typeof courseInputSchema>;
export type BatchInput = z.infer<typeof batchInputSchema>;
export type BatchUpdate = z.infer<typeof batchUpdateSchema>;
