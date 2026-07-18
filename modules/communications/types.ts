import type { EmailType } from '@/lib/domain/types';

export type { EmailType };

// The 7 Phase 1 email types (E01–E07). Phase 2 types exist in the database
// CHECK constraint but have no sending logic yet.
export const PHASE_1_EMAIL_TYPES: readonly EmailType[] = [
  'welcome',
  'payment_instruction',
  'reminder_1',
  'reminder_2',
  'reminder_3',
  'reminder_4',
  'payment_confirmation',
] as const;

// Which Batch automation toggle gates each email type (BR-10).
// payment_confirmation is transactional (a receipt for money received), so it
// is gated only by batch.is_active and the template toggle, not by the
// payment-reminder toggle.
export const EMAIL_TYPE_TOGGLE: Partial<
  Record<EmailType, 'welcome_email_enabled' | 'payment_reminder_enabled' | 'class_reminder_enabled'>
> = {
  welcome: 'welcome_email_enabled',
  payment_instruction: 'payment_reminder_enabled',
  reminder_1: 'payment_reminder_enabled',
  reminder_2: 'payment_reminder_enabled',
  reminder_3: 'payment_reminder_enabled',
  reminder_4: 'payment_reminder_enabled',
  class_reminder_24h: 'class_reminder_enabled',
  class_reminder_2h: 'class_reminder_enabled',
  zoom_link: 'class_reminder_enabled',
};

// Everything template rendering needs about one Registration, joined across
// modules' tables by the communications repository (service-role context).
export interface RegistrationEmailContext {
  registrationId: string;
  participantFullName: string;
  participantEmail: string;
  participantPhone: string;
  participantDeleted: boolean;
  courseId: string;
  courseName: string;
  courseCode: string;
  cohortLabel: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  paymentStatus: string;
  startDate: string;
  startTime: string;
  endDate: string;
  zoomLink: string | null;
  whatsappGroupLink: string | null;
  facilitatorName: string;
  batchIsActive: boolean;
  welcomeEmailEnabled: boolean;
  paymentReminderEnabled: boolean;
  classReminderEnabled: boolean;
  whatsappEnabled: boolean;
}

export interface ReminderRunSummary {
  date: string;
  evaluated: number;
  sent: number;
  skippedDeduplicated: number;
  skippedPaidSinceQuery: number;
  skippedInactiveBatch: number;
  whatsappSent: number;
  errors: string[];
}
