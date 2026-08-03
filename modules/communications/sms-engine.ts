// SMS key-moment messaging engine (founder-approved 2026-07-19), mirroring
// the WhatsApp engine's design exactly:
//   gates → BR-07-style reservation (sms_log unique constraint) → send.
// Unlike WhatsApp, message bodies are composed here — Arkesel has no
// server-side template approval step. Bodies are kept short deliberately:
// one SMS segment is 160 characters and each extra segment costs a credit.
import { isSmsConfigured, normalizeSmsPhone, sendSmsMessage } from '@/lib/arkesel/client';
import * as communicationsRepository from '@/modules/communications/repository';
import type { SmsMessageType } from '@/lib/domain/types';
import type { RegistrationEmailContext } from '@/modules/communications/types';
import { formatGhs } from '@/lib/utils';

export type SmsSendOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'skipped_gated'
  | 'skipped_not_configured'
  | 'skipped_bad_phone'
  | 'skipped_deleted_participant'
  | 'failed';

export function smsBodyForMessageType(
  messageType: SmsMessageType,
  context: RegistrationEmailContext,
  extra: Record<string, string> = {},
): string {
  switch (messageType) {
    case 'welcome':
      // Free events keep the 'welcome' message type — so BR-07 deduplication
      // is unchanged — and swap only the body. Quoting "Fee: GHS 0.00" and
      // promising payment instructions on a webinar is exactly the failure
      // this branch exists to prevent.
      if (context.isFree) {
        return (
          `Hi ${context.participantFirstName}, you're registered for ` +
          `${context.courseName} (${context.cohortLabel}) on ${context.startDate} at ` +
          `${context.startTime}. It's free — nothing to pay. Joining details are in your ` +
          `email. - Knowsia`
        );
      }
      return (
        `Hi ${context.participantFirstName}, we received your registration for ` +
        `${context.courseName} (${context.cohortLabel}). Fee: ${formatGhs(context.courseFee)}. ` +
        `Payment instructions have been sent to your email. - Knowsia`
      );
    case 'payment_confirmation':
      return (
        `Hi ${context.participantFirstName}, your payment of ${formatGhs(context.amountPaid)} for ` +
        `${context.courseName} is received. Your seat is confirmed. ` +
        `Starts ${context.startDate} at ${context.startTime}. - Knowsia`
      );
    case 'class_reminder_24h':
      return (
        `Hi ${context.participantFirstName}, reminder: ${context.courseName} ` +
        `(${context.cohortLabel}) starts tomorrow, ${context.startDate} at ${context.startTime}. ` +
        `Your Zoom link is in your student portal. - Knowsia`
      );
    case 'class_reminder_2h':
      return (
        `Hi ${context.participantFirstName}, ${context.courseName} starts in about 2 hours ` +
        `(${context.startTime}). Join here: ${context.zoomLink ?? ''} - Knowsia`
      );
    case 'upsell':
      return (
        `Hi ${context.participantFirstName}, the course you asked about, ` +
        `${extra.pitch_course_name ?? ''} (${extra.pitch_cohort_label ?? ''}), starts ` +
        `${extra.pitch_start_date ?? ''}. Fee: GHS ${extra.pitch_fee ?? ''}. Reply to reserve your seat! - Knowsia`
      );
    case 'whatsapp_invite':
      return (
        `Hi ${context.participantFirstName}, join the ${context.courseName} WhatsApp group ` +
        `for updates: ${context.whatsappGroupLink ?? ''} - Knowsia`
      );
    default:
      // All four payment reminders share one body; dedup is per
      // message_type, so each still sends at most once.
      return (
        `Hi ${context.participantFirstName}, ${formatGhs(context.balance)} is outstanding for ` +
        `${context.courseName} starting ${context.startDate}. ` +
        `Kindly complete payment to secure your seat. - Knowsia`
      );
  }
}

export async function sendSmsOnce(
  registrationId: string,
  messageType: SmsMessageType,
  extra: Record<string, string> = {},
): Promise<SmsSendOutcome> {
  // Missing Arkesel credentials (pre-setup, local dev) must never reserve a
  // log slot — otherwise the message becomes permanently unsendable once
  // credentials exist (same permanent-block reasoning as BR-09/BR-10).
  if (!isSmsConfigured()) return 'skipped_not_configured';

  const context =
    await communicationsRepository.selectRegistrationEmailContext(registrationId);
  if (!context) return 'skipped_gated';
  if (context.participantDeleted) return 'skipped_deleted_participant';

  // Gates before reservation: batch active + per-batch SMS toggle.
  if (!context.batchIsActive || !context.smsEnabled) return 'skipped_gated';

  // Reminders additionally respect the payment-reminder toggle, matching the
  // email engine's BR-10 mapping.
  if (messageType.startsWith('reminder_') && !context.paymentReminderEnabled) {
    return 'skipped_gated';
  }

  // Class reminders respect the class-reminder toggle, same BR-10 mapping as
  // the email engine's EMAIL_TYPE_TOGGLE (SMS has no per-type lookup table).
  if (
    (messageType === 'class_reminder_24h' || messageType === 'class_reminder_2h') &&
    !context.classReminderEnabled
  ) {
    return 'skipped_gated';
  }

  if (!normalizeSmsPhone(context.participantPhone)) return 'skipped_bad_phone';

  const reservation = await communicationsRepository.reserveSmsLogSlot(
    registrationId,
    messageType,
  );
  if (reservation === 'duplicate') return 'skipped_duplicate';

  try {
    await sendSmsMessage({
      toPhone: context.participantPhone,
      message: smsBodyForMessageType(messageType, context, extra),
    });
    await communicationsRepository.updateSmsLogEntry(registrationId, messageType, {
      success: true,
      error_message: null,
    });
    return 'sent';
  } catch (err) {
    await communicationsRepository
      .updateSmsLogEntry(registrationId, messageType, {
        success: false,
        error_message: String(err),
      })
      .catch(() => undefined);
    return 'failed';
  }
}
