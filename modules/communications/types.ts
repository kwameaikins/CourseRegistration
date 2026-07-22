import { z } from 'zod';

import type { EmailType } from '@/lib/domain/types';

export type { EmailType };

// Every email type the database CHECK constraint accepts — the messaging
// editor exposes all of them (Phase 2 types can be authored ahead of time).
export const ALL_EMAIL_TYPES: readonly EmailType[] = [
  'welcome',
  'payment_instruction',
  'reminder_1',
  'reminder_2',
  'reminder_3',
  'reminder_4',
  'payment_confirmation',
  'class_reminder_24h',
  'class_reminder_2h',
  'zoom_link',
  'whatsapp_invite',
  'post_training_thankyou',
  'upsell',
] as const;

export const templateUpsertSchema = z.object({
  courseId: z.uuid(),
  emailType: z.enum(ALL_EMAIL_TYPES as [EmailType, ...EmailType[]]),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(50000),
  isActive: z.boolean(),
});

export type TemplateUpsertInput = z.infer<typeof templateUpsertSchema>;

export interface EmailTemplateView {
  id: string;
  courseId: string;
  emailType: EmailType;
  subject: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
}

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
  // Used to address the participant in message greetings ("Hi {{first
  // name}}") — friendlier than the full name and what founders asked for
  // (system review, 2026-07-22). participantFullName is kept for anything
  // that still needs the complete name.
  participantFirstName: string;
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
  smsEnabled: boolean;
}

export interface ReminderRunSummary {
  date: string;
  evaluated: number;
  sent: number;
  skippedDeduplicated: number;
  skippedPaidSinceQuery: number;
  skippedInactiveBatch: number;
  whatsappSent: number;
  smsSent: number;
  errors: string[];
}

// Sent-message log (admin review screen) — a merged, reverse-chronological
// feed across email_log/whatsapp_log/sms_log. Admin-only, same visibility
// rule as the Registration 360 view's message history.
export const messageLogFiltersSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'sms']).optional(),
  status: z.enum(['success', 'failed']).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type MessageLogFilters = z.infer<typeof messageLogFiltersSchema>;

export interface MessageLogRow {
  channel: 'email' | 'whatsapp' | 'sms';
  messageType: string;
  sentAt: string;
  success: boolean;
  errorMessage: string | null;
  registrationId: string;
  participantName: string;
  participantEmail: string;
  courseName: string;
  cohortLabel: string;
}
