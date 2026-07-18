// F1.06 — the shared email engine. Every module sends email exclusively
// through sendEmailOnce (Document 2, Section 9).
import { sendTransactionalEmail } from '@/lib/resend/client';
import * as communicationsRepository from '@/modules/communications/repository';
import { EMAIL_TYPE_TOGGLE, type EmailType } from '@/modules/communications/types';

export type SendOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'skipped_gated'
  | 'skipped_no_template'
  | 'skipped_deleted_participant'
  | 'failed';

// Template placeholders use {{placeholder}} syntax; rendering is a simple
// string replace (Document 7, Section 2.3). Unknown placeholders are left
// as-is rather than replaced with empty strings, so a template typo is
// visible in the received email instead of silently vanishing.
export function renderTemplateBody(
  templateBody: string,
  data: Record<string, string>,
): string {
  return templateBody.replace(/\{\{(\w+)\}\}/g, (match, key: string) => data[key] ?? match);
}

export async function sendEmailOnce(
  registrationId: string,
  emailType: EmailType,
): Promise<SendOutcome> {
  const context =
    await communicationsRepository.selectRegistrationEmailContext(registrationId);
  if (!context) return 'skipped_gated';

  // Never email an erasure-requested (soft-deleted) Participant — their
  // address has been anonymised anyway (BR-16).
  if (context.participantDeleted) return 'skipped_deleted_participant';

  // BR-09/BR-10: all gates are checked BEFORE the BR-07 reservation.
  // Reserving first would permanently block a re-enabled email type, since
  // the email_log row would already exist (Document 4, correction note).
  if (!context.batchIsActive) return 'skipped_gated';
  const toggleColumn = EMAIL_TYPE_TOGGLE[emailType];
  if (toggleColumn === 'welcome_email_enabled' && !context.welcomeEmailEnabled) {
    return 'skipped_gated';
  }
  if (toggleColumn === 'payment_reminder_enabled' && !context.paymentReminderEnabled) {
    return 'skipped_gated';
  }
  if (toggleColumn === 'class_reminder_enabled' && !context.classReminderEnabled) {
    return 'skipped_gated';
  }

  const template = await communicationsRepository.selectTemplate(
    context.courseId,
    emailType,
  );
  // No template for this Course + Type, or template toggled off (BR-10):
  // skip before reserving, for the same permanent-block reason as above.
  if (!template || !template.is_active) return 'skipped_no_template';

  // BR-07: reserve the email_log slot FIRST — the unique constraint makes
  // concurrent duplicate sends impossible before Resend is ever called.
  const reservation = await communicationsRepository.reserveEmailLogSlot(
    registrationId,
    emailType,
  );
  if (reservation === 'duplicate') return 'skipped_duplicate';

  const placeholderData: Record<string, string> = {
    participant_name: context.participantFullName,
    full_name: context.participantFullName,
    course_name: context.courseName,
    course_code: context.courseCode,
    cohort_label: context.cohortLabel,
    course_fee: context.courseFee.toFixed(2),
    amount_paid: context.amountPaid.toFixed(2),
    balance: context.balance.toFixed(2),
    payment_status: context.paymentStatus,
    start_date: context.startDate,
    start_time: context.startTime,
    end_date: context.endDate,
    zoom_link: context.zoomLink ?? '',
    // Course-specific group (Batch.whatsappGroupLink) — meant for the
    // payment_confirmation template, sent only once payment is confirmed.
    whatsapp_group_link: context.whatsappGroupLink ?? '',
    // Business-wide community links (not per-Batch) — meant for the
    // welcome/payment_instruction templates, sent immediately at registration.
    community_whatsapp_link: process.env.COMMUNITY_WHATSAPP_LINK ?? '',
    whatsapp_channel_link: process.env.COMMUNITY_WHATSAPP_CHANNEL_LINK ?? '',
    facilitator_name: context.facilitatorName,
  };

  try {
    await sendTransactionalEmail({
      to: context.participantEmail,
      subject: renderTemplateBody(template.subject, placeholderData),
      html: renderTemplateBody(template.body, placeholderData),
    });
    await communicationsRepository.updateEmailLogEntry(registrationId, emailType, {
      success: true,
      error_message: null,
    });
    return 'sent';
  } catch (err) {
    await communicationsRepository
      .updateEmailLogEntry(registrationId, emailType, {
        success: false,
        error_message: String(err),
      })
      .catch(() => undefined);
    return 'failed';
  }
}
