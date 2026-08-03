// WhatsApp key-moment messaging engine (founder-approved 2026-07-18),
// mirroring the email engine's design exactly:
//   gates → BR-07-style reservation (whatsapp_log unique constraint) → send.
import {
  isWhatsappConfigured,
  normalizeWhatsappPhone,
  sendWhatsappTemplateMessage,
} from '@/lib/whatsapp/client';
import * as communicationsRepository from '@/modules/communications/repository';
import type { WhatsappMessageType } from '@/lib/domain/types';
import type { RegistrationEmailContext } from '@/modules/communications/types';
import { formatGhs } from '@/lib/utils';

export type WhatsappSendOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'skipped_gated'
  | 'skipped_not_configured'
  | 'skipped_bad_phone'
  | 'skipped_deleted_participant'
  | 'failed';

// Meta Business Manager template names — the bodies live at Meta, not here.
// See supabase/migrations/202607180002_whatsapp.sql header for the required
// template definitions and their positional parameters.
export function templateForMessageType(
  messageType: WhatsappMessageType,
  context: RegistrationEmailContext,
  extra: Record<string, string> = {},
): { templateName: string; bodyParameters: string[] } {
  const courseLabel = `${context.courseName} (${context.cohortLabel})`;
  switch (messageType) {
    case 'class_reminder_24h':
      return {
        templateName: 'course_class_reminder_24h',
        bodyParameters: [
          context.participantFirstName,
          courseLabel,
          context.startDate,
          context.startTime,
        ],
      };
    case 'class_reminder_2h':
      return {
        templateName: 'course_class_reminder_2h',
        bodyParameters: [
          context.participantFirstName,
          courseLabel,
          context.startTime,
          context.zoomLink ?? '',
        ],
      };
    case 'upsell':
      return {
        templateName: 'course_upsell_pitch',
        bodyParameters: [
          context.participantFirstName,
          `${extra.pitch_course_name ?? ''} (${extra.pitch_cohort_label ?? ''})`,
          extra.pitch_start_date ?? '',
          extra.pitch_fee ?? '',
        ],
      };
    case 'whatsapp_invite':
      return {
        templateName: 'course_whatsapp_group_invite',
        bodyParameters: [context.participantFirstName, courseLabel, context.whatsappGroupLink ?? ''],
      };
    case 'welcome':
      // Community links are business-wide (not per-Batch), so they come from
      // env rather than the join context — every participant gets the same
      // Professional Learning Network group and WhatsApp channel invite.
      return {
        templateName: 'course_registration_welcome',
        bodyParameters: [
          context.participantFirstName,
          courseLabel,
          context.startDate,
          formatGhs(context.courseFee),
          process.env.COMMUNITY_WHATSAPP_LINK ?? '',
          process.env.COMMUNITY_WHATSAPP_CHANNEL_LINK ?? '',
        ],
      };
    case 'payment_confirmation':
      // The course-specific group link only goes out once payment is
      // confirmed — it is the Batch's own whatsappGroupLink (Document 5).
      return {
        templateName: 'course_payment_confirmation',
        bodyParameters: [
          context.participantFirstName,
          courseLabel,
          formatGhs(context.amountPaid),
          context.whatsappGroupLink ?? '',
        ],
      };
    default:
      // All four payment reminders share one approved template; dedup is
      // per message_type, so each still sends at most once.
      return {
        templateName: 'course_payment_reminder',
        bodyParameters: [
          context.participantFirstName,
          courseLabel,
          formatGhs(context.balance),
          context.startDate,
        ],
      };
  }
}

export async function sendWhatsappOnce(
  registrationId: string,
  messageType: WhatsappMessageType,
  extra: Record<string, string> = {},
): Promise<WhatsappSendOutcome> {
  // Missing Meta credentials (pre-setup, local dev) must never reserve a
  // log slot — otherwise the message becomes permanently unsendable once
  // credentials exist (same permanent-block reasoning as BR-09/BR-10).
  if (!isWhatsappConfigured()) return 'skipped_not_configured';

  const context =
    await communicationsRepository.selectRegistrationEmailContext(registrationId);
  if (!context) return 'skipped_gated';
  if (context.participantDeleted) return 'skipped_deleted_participant';

  // Gates before reservation: batch active + per-batch WhatsApp toggle.
  if (!context.batchIsActive || !context.whatsappEnabled) return 'skipped_gated';

  // Free events (2026-08-03): every money-shaped WhatsApp template quotes an
  // amount in its Meta-approved positional parameters — 'welcome' takes the
  // course fee, the reminders take the outstanding balance, and
  // payment_confirmation takes the amount received. None can be sent for a
  // webinar without reading "GHS 0.00", and the parameter list cannot be
  // changed without re-approval. Skip before the BR-07 reservation, so these
  // become sendable the moment a fee-free template is approved and wired up.
  if (
    context.isFree &&
    (messageType === 'welcome' ||
      messageType === 'payment_confirmation' ||
      messageType.startsWith('reminder_'))
  ) {
    return 'skipped_gated';
  }

  // Reminders additionally respect the payment-reminder toggle, matching the
  // email engine's BR-10 mapping.
  if (messageType.startsWith('reminder_') && !context.paymentReminderEnabled) {
    return 'skipped_gated';
  }

  // Class reminders respect the class-reminder toggle, same BR-10 mapping as
  // the email engine's EMAIL_TYPE_TOGGLE (WhatsApp has no per-type lookup table).
  if (
    (messageType === 'class_reminder_24h' || messageType === 'class_reminder_2h') &&
    !context.classReminderEnabled
  ) {
    return 'skipped_gated';
  }

  if (!normalizeWhatsappPhone(context.participantPhone)) return 'skipped_bad_phone';

  const reservation = await communicationsRepository.reserveWhatsappLogSlot(
    registrationId,
    messageType,
  );
  if (reservation === 'duplicate') return 'skipped_duplicate';

  try {
    const { templateName, bodyParameters } = templateForMessageType(messageType, context, extra);
    await sendWhatsappTemplateMessage({
      toPhone: context.participantPhone,
      templateName,
      bodyParameters,
    });
    await communicationsRepository.updateWhatsappLogEntry(registrationId, messageType, {
      success: true,
      error_message: null,
    });
    return 'sent';
  } catch (err) {
    await communicationsRepository
      .updateWhatsappLogEntry(registrationId, messageType, {
        success: false,
        error_message: String(err),
      })
      .catch(() => undefined);
    return 'failed';
  }
}
