// Daily reminder evaluation (F1.07, E03–E06), triggered by Vercel Cron at
// 07:00 UTC (BR-17 — Ghana is UTC+0 year-round, no drift correction needed).
import { sendEmailOnce } from '@/modules/communications/email-engine';
import { sendWhatsappOnce } from '@/modules/communications/whatsapp-engine';
import * as communicationsRepository from '@/modules/communications/repository';
import type { EmailType, ReminderRunSummary } from '@/modules/communications/types';
import type { WhatsappMessageType } from '@/lib/domain/types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Reminder conditions relative to "now" and the Batch start date:
//   reminder_1 (E03) — sent at registration time by the registrations module,
//                      re-evaluated here as a catch-up for any missed send.
//   reminder_2 (E04) — 24 hours after registration.
//   reminder_3 (E05) — 2 days before the Batch start date.
//   reminder_4 (E06) — the morning of the Batch start date.
export function dueReminderTypes(
  now: Date,
  registeredAt: Date,
  batchStartDate: string,
): EmailType[] {
  const due: EmailType[] = ['reminder_1'];
  if (now.getTime() - registeredAt.getTime() >= DAY_MS) {
    due.push('reminder_2');
  }

  const todayIso = now.toISOString().slice(0, 10);
  const twoDaysAheadIso = new Date(now.getTime() + 2 * DAY_MS).toISOString().slice(0, 10);
  if (batchStartDate <= twoDaysAheadIso) {
    due.push('reminder_3');
  }
  if (batchStartDate <= todayIso) {
    due.push('reminder_4');
  }
  return due;
}

// Idempotent by design: BR-07's email_log constraint makes re-running this
// job (manual re-trigger, recovery) always safe (Document 2, Section 7).
export async function runDailyReminders(now = new Date()): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    date: now.toISOString().slice(0, 10),
    evaluated: 0,
    sent: 0,
    skippedDeduplicated: 0,
    skippedPaidSinceQuery: 0,
    skippedInactiveBatch: 0,
    whatsappSent: 0,
    errors: [],
  };

  const candidates =
    await communicationsRepository.selectUnpaidRegistrationsInActiveBatches();

  for (const candidate of candidates) {
    summary.evaluated += 1;
    const reminders = dueReminderTypes(
      now,
      new Date(candidate.registeredAt),
      candidate.batchStartDate,
    );

    for (const reminderType of reminders) {
      try {
        // BR-08: fresh Payment Status check at send time, not query time —
        // a payment confirmed since the initial query cancels the reminder.
        const currentStatus = await communicationsRepository.selectCurrentPaymentStatus(
          candidate.registrationId,
        );
        if (currentStatus === 'Paid') {
          summary.skippedPaidSinceQuery += 1;
          continue;
        }

        const outcome = await sendEmailOnce(candidate.registrationId, reminderType);
        if (outcome === 'sent') summary.sent += 1;
        else if (outcome === 'skipped_duplicate') summary.skippedDeduplicated += 1;
        else if (outcome === 'skipped_gated') summary.skippedInactiveBatch += 1;
        else if (outcome === 'failed') {
          summary.errors.push(`${candidate.registrationId}/${reminderType}: send failed`);
        }

        // WhatsApp reminder alongside the email — its own whatsapp_log dedup
        // makes re-runs safe; the BR-08 status check above covers both.
        const whatsappOutcome = await sendWhatsappOnce(
          candidate.registrationId,
          reminderType as WhatsappMessageType,
        );
        if (whatsappOutcome === 'sent') summary.whatsappSent += 1;
        else if (whatsappOutcome === 'failed') {
          summary.errors.push(
            `${candidate.registrationId}/${reminderType}: whatsapp send failed`,
          );
        }
      } catch (err) {
        summary.errors.push(`${candidate.registrationId}/${reminderType}: ${String(err)}`);
      }
    }
  }

  return summary;
}
