// Public surface of the communications module — the one module every other
// module may call directly (Document 2, Section 9).
export { sendEmailOnce, renderTemplateBody } from '@/modules/communications/email-engine';
export { sendWhatsappOnce } from '@/modules/communications/whatsapp-engine';
export { sendSmsOnce } from '@/modules/communications/sms-engine';
export { runDailyReminders } from '@/modules/communications/reminder-scheduler';
export {
  getTemplatesForCourse,
  saveTemplate,
} from '@/modules/communications/template-admin';
export { getMessageLog } from '@/modules/communications/message-log';
export type {
  EmailTemplateView,
  EmailType,
  MessageLogFilters,
  MessageLogRow,
  ReminderRunSummary,
  TemplateUpsertInput,
} from '@/modules/communications/types';
export type { SmsMessageType, WhatsappMessageType } from '@/lib/domain/types';
