// Public surface of the communications module — the one module every other
// module may call directly (Document 2, Section 9).
export { sendEmailOnce, renderTemplateBody } from '@/modules/communications/email-engine';
export { sendWhatsappOnce } from '@/modules/communications/whatsapp-engine';
export { runDailyReminders } from '@/modules/communications/reminder-scheduler';
export type { EmailType, ReminderRunSummary } from '@/modules/communications/types';
export type { WhatsappMessageType } from '@/lib/supabase/database.types';
