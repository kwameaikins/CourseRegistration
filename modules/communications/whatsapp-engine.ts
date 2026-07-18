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
): { templateName: string; bodyParameters: string[] } {
  const courseLabel = `${context.courseName} (${context.cohortLabel})`;
  switch (messageType) {
    case 'welcome':
      // Community links are business-wide (not per-Batch), so they come from
      // env rather than the join context — every participant gets the same
      // Professional Learning Network group and WhatsApp channel invite.
      return {
        templateName: 'course_registration_welcome',
        bodyParameters: [
          context.participantFullName,
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
          context.participantFullName,
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
          context.participantFullName,
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

  // Reminders additionally respect the payment-reminder toggle, matching the
  // email engine's BR-10 mapping.
  if (messageType.startsWith('reminder_') && !context.paymentReminderEnabled) {
    return 'skipped_gated';
  }

  if (!normalizeWhatsappPhone(context.participantPhone)) return 'skipped_bad_phone';

  const reservation = await communicationsRepository.reserveWhatsappLogSlot(
    registrationId,
    messageType,
  );
  if (reservation === 'duplicate') return 'skipped_duplicate';

  try {
    const { templateName, bodyParameters } = templateForMessageType(messageType, context);
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
