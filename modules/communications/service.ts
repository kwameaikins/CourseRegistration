// Public surface of the communications module — the one module every other
// module may call directly (Document 2, Section 9).
export { sendEmailOnce, renderTemplateBody } from '@/modules/communications/email-engine';
export { sendWhatsappOnce } from '@/modules/communications/whatsapp-engine';
export { sendSmsOnce } from '@/modules/communications/sms-engine';
export {
  runDailyReminders,
  runInstallmentReminders,
} from '@/modules/communications/reminder-scheduler';
export { runClassReminderDispatch } from '@/modules/communications/class-reminder-scheduler';
export { runUpsellMessageDispatch } from '@/modules/communications/upsell-scheduler';
export {
  getTemplatesForCourse,
  saveTemplate,
} from '@/modules/communications/template-admin';
export { getMessageLog, getMessageLogForRegistrations } from '@/modules/communications/message-log';
// The branded email frame (logo, type, sign-off) for an ad-hoc email built
// outside the template pipeline — the registration invoice (2026-09-18).
export { wrap as wrapEmailHtml } from '@/modules/communications/default-templates';
export type {
  EmailTemplateView,
  EmailType,
  MessageLogFilters,
  MessageLogRow,
  ReminderRunSummary,
  TemplateUpsertInput,
} from '@/modules/communications/types';
export type { SmsMessageType, WhatsappMessageType } from '@/lib/domain/types';
