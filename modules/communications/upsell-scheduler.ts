// Upsell/cross-sell messaging (email/SMS/WhatsApp), founder-flagged gap
// closed 2026-08-01 — reuses the exact same feedback-interest-matches-an-
// open-batch eligibility logic the Vapi voice call's 'upsell' type already
// uses (modules/voice/service.ts's getUpsellCandidates), just fanned out to
// the other 3 channels too.
//
// Known limitation, inherited from the voice call, not new here:
// email_log/sms_log/whatsapp_log dedupe on (registration_id, message_type)
// with a fixed 'upsell' type, so a registrant can only ever receive one
// upsell message per channel, ever, regardless of which course is pitched —
// call_log has the identical constraint shape for the voice call. Revisit if
// repeat upsell pitches are ever wanted.
import { sendEmailOnce } from '@/modules/communications/email-engine';
import { sendWhatsappOnce } from '@/modules/communications/whatsapp-engine';
import { sendSmsOnce } from '@/modules/communications/sms-engine';
import * as voiceService from '@/modules/voice/service';
import { formatGhs } from '@/lib/utils';

export interface UpsellRunSummary {
  evaluated: number;
  sent: number;
  skippedDeduplicated: number;
  skippedGated: number;
  whatsappSent: number;
  smsSent: number;
  errors: string[];
}

export async function runUpsellMessageDispatch(now = new Date()): Promise<UpsellRunSummary> {
  const summary: UpsellRunSummary = {
    evaluated: 0,
    sent: 0,
    skippedDeduplicated: 0,
    skippedGated: 0,
    whatsappSent: 0,
    smsSent: 0,
    errors: [],
  };

  const todayIso = now.toISOString().slice(0, 10);
  const candidates = await voiceService.getUpsellCandidates(todayIso);

  for (const candidate of candidates) {
    summary.evaluated += 1;
    const extra = {
      pitch_course_name: candidate.pitchCourseName,
      pitch_cohort_label: candidate.pitchCohortLabel,
      pitch_start_date: candidate.pitchStartDate,
      pitch_fee: formatGhs(candidate.pitchFee),
    };

    try {
      const outcome = await sendEmailOnce(candidate.registrationId, 'upsell', extra);
      if (outcome === 'sent') summary.sent += 1;
      else if (outcome === 'skipped_duplicate') summary.skippedDeduplicated += 1;
      else if (outcome === 'skipped_gated' || outcome === 'skipped_no_template') {
        summary.skippedGated += 1;
      } else if (outcome === 'failed') {
        summary.errors.push(`${candidate.registrationId}/upsell: send failed`);
      }

      const whatsappOutcome = await sendWhatsappOnce(candidate.registrationId, 'upsell', extra);
      if (whatsappOutcome === 'sent') summary.whatsappSent += 1;
      else if (whatsappOutcome === 'failed') {
        summary.errors.push(`${candidate.registrationId}/upsell: whatsapp send failed`);
      }

      const smsOutcome = await sendSmsOnce(candidate.registrationId, 'upsell', extra);
      if (smsOutcome === 'sent') summary.smsSent += 1;
      else if (smsOutcome === 'failed') {
        summary.errors.push(`${candidate.registrationId}/upsell: sms send failed`);
      }
    } catch (err) {
      summary.errors.push(`${candidate.registrationId}/upsell: ${String(err)}`);
    }
  }

  return summary;
}
