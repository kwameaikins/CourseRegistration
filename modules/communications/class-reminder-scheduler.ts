// Class reminder dispatch (batch-level, founder-flagged gap closed
// 2026-08-01). Two conditions, both driven by the batch's start_date +
// start_time — Ghana is UTC+0 year-round (BR-17), so
// `${start_date}T${start_time}Z` is already a correct UTC instant, no
// timezone library needed.
//   class_reminder_24h — batch starts tomorrow (date-level match; fine for a
//                         once-daily cron check, same precision philosophy as
//                         reminder_3/reminder_4).
//   class_reminder_2h  — batch start instant falls within the next 2 hours.
//                         Only reliably caught by the frequent external
//                         scheduler (app/api/cron/class-reminders-frequent),
//                         though the daily cron may incidentally also catch it.
// Safe to call from multiple cron entry points — every send is deduped by
// its own email_log/sms_log/whatsapp_log unique constraint, so re-checking
// the same registration twice is a no-op, never a double-send.
import { sendEmailOnce } from '@/modules/communications/email-engine';
import { sendWhatsappOnce } from '@/modules/communications/whatsapp-engine';
import { sendSmsOnce } from '@/modules/communications/sms-engine';
import * as communicationsRepository from '@/modules/communications/repository';

const HOUR_MS = 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * HOUR_MS;
const DAY_MS = 24 * HOUR_MS;

export interface ClassReminderRunSummary {
  evaluated: number;
  sent: number;
  skippedDeduplicated: number;
  skippedGated: number;
  whatsappSent: number;
  smsSent: number;
  errors: string[];
}

function batchStartInstant(batchStartDate: string, batchStartTime: string): Date {
  return new Date(`${batchStartDate}T${batchStartTime}Z`);
}

export function dueClassReminderTypes(
  now: Date,
  batchStartDate: string,
  batchStartTime: string,
): Array<'class_reminder_24h' | 'class_reminder_2h'> {
  const due: Array<'class_reminder_24h' | 'class_reminder_2h'> = [];
  const tomorrowIso = new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10);
  if (batchStartDate === tomorrowIso) due.push('class_reminder_24h');

  const msUntilStart = batchStartInstant(batchStartDate, batchStartTime).getTime() - now.getTime();
  if (msUntilStart >= 0 && msUntilStart <= TWO_HOURS_MS) due.push('class_reminder_2h');

  return due;
}

// Idempotent by design: each channel's own log-table unique constraint makes
// re-running this job (manual re-trigger, the frequent+daily cron overlap)
// always safe.
export async function runClassReminderDispatch(
  now = new Date(),
): Promise<ClassReminderRunSummary> {
  const summary: ClassReminderRunSummary = {
    evaluated: 0,
    sent: 0,
    skippedDeduplicated: 0,
    skippedGated: 0,
    whatsappSent: 0,
    smsSent: 0,
    errors: [],
  };

  const candidates = await communicationsRepository.selectConfirmedRegistrationsInActiveBatches();

  for (const candidate of candidates) {
    summary.evaluated += 1;
    const reminderTypes = dueClassReminderTypes(
      now,
      candidate.batchStartDate,
      candidate.batchStartTime,
    );

    for (const reminderType of reminderTypes) {
      try {
        const outcome = await sendEmailOnce(candidate.registrationId, reminderType);
        if (outcome === 'sent') summary.sent += 1;
        else if (outcome === 'skipped_duplicate') summary.skippedDeduplicated += 1;
        else if (outcome === 'skipped_gated' || outcome === 'skipped_no_template') {
          summary.skippedGated += 1;
        } else if (outcome === 'failed') {
          summary.errors.push(`${candidate.registrationId}/${reminderType}: send failed`);
        }

        const whatsappOutcome = await sendWhatsappOnce(candidate.registrationId, reminderType);
        if (whatsappOutcome === 'sent') summary.whatsappSent += 1;
        else if (whatsappOutcome === 'failed') {
          summary.errors.push(`${candidate.registrationId}/${reminderType}: whatsapp send failed`);
        }

        const smsOutcome = await sendSmsOnce(candidate.registrationId, reminderType);
        if (smsOutcome === 'sent') summary.smsSent += 1;
        else if (smsOutcome === 'failed') {
          summary.errors.push(`${candidate.registrationId}/${reminderType}: sms send failed`);
        }
      } catch (err) {
        summary.errors.push(`${candidate.registrationId}/${reminderType}: ${String(err)}`);
      }
    }
  }

  return summary;
}
