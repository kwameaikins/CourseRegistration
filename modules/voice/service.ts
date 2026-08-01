// Agentic voice-call business rules (founder-approved 2026-07-19).
//
// Dispatch runs in the daily 07:00 cron; every call is created with a Vapi
// schedulePlan so dialing happens inside the 10:00–17:00 Ghana calling
// window, never at cron time. One call per Registration per type — the
// call_log unique constraint is reserved BEFORE dialing (BR-07 analog).
// Results come back through the Vapi end-of-call webhook: transcript,
// summary, structured data (promised payment dates, bank references, voice
// feedback ratings, human-callback flags).
import {
  isVoiceConfigured,
  normalizeCallPhone,
  startOutboundCall,
} from '@/lib/vapi/client';
import { formatGhs } from '@/lib/utils';
import { AppError } from '@/lib/errors';
import * as voiceRepository from '@/modules/voice/repository';
import * as feedbackService from '@/modules/feedback/service';
import { feedbackSubmissionSchema } from '@/modules/feedback/types';
import type {
  CallLogView,
  VoiceCallType,
  VoiceDispatchSummary,
} from '@/modules/voice/types';

const DAY_MS = 24 * 60 * 60 * 1000;

// 10:00 Ghana time (UTC+0) on the dispatch day.
export function callingWindowStart(now: Date): string {
  return `${now.toISOString().slice(0, 10)}T10:00:00.000Z`;
}

async function dispatchCallsOfType(
  callType: VoiceCallType,
  registrationIds: string[],
  extraVariables: Map<string, Record<string, string>> | null,
  earliestAt: string,
  summary: VoiceDispatchSummary,
): Promise<void> {
  if (registrationIds.length === 0) return;
  const contexts = await voiceRepository.selectCallContexts(registrationIds);

  for (const registrationId of registrationIds) {
    const context = contexts.get(registrationId);
    if (!context || context.deleted) continue;
    if (!normalizeCallPhone(context.phone)) {
      summary.skippedBadPhone += 1;
      continue;
    }

    const reservation = await voiceRepository.reserveCallSlot(
      registrationId,
      callType,
      context.phone,
    );
    if (reservation.outcome === 'duplicate') {
      summary.skippedDuplicates += 1;
      continue;
    }

    try {
      const { vapiCallId } = await startOutboundCall({
        toPhone: context.phone,
        earliestAt,
        variableValues: {
          call_type: callType,
          participant_name: context.participantFirstName,
          course_name: context.courseName,
          cohort_label: context.cohortLabel,
          start_date: context.startDate,
          course_fee: formatGhs(context.courseFee),
          balance: formatGhs(context.balance),
          ...(extraVariables?.get(registrationId) ?? {}),
        },
      });
      await voiceRepository.updateCallLog(reservation.id, {
        vapi_call_id: vapiCallId,
        status: 'scheduled',
      });
      summary.callsScheduled += 1;
    } catch (err) {
      await voiceRepository
        .updateCallLog(reservation.id, { status: 'failed', summary: String(err) })
        .catch(() => undefined);
      summary.errors.push(`${registrationId}/${callType}: ${String(err)}`);
    }
  }
}

export async function runVoiceCallDispatch(now = new Date()): Promise<VoiceDispatchSummary> {
  const todayIso = now.toISOString().slice(0, 10);
  const summary: VoiceDispatchSummary = {
    date: todayIso,
    callsScheduled: 0,
    skippedDuplicates: 0,
    skippedBadPhone: 0,
    errors: [],
  };
  if (!isVoiceConfigured()) return summary;

  const earliestAt = callingWindowStart(now);
  const yesterdayIso = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  const threeDaysAgoIso = new Date(now.getTime() - 3 * DAY_MS).toISOString();
  const threeDaysAheadIso = new Date(now.getTime() + 3 * DAY_MS).toISOString().slice(0, 10);
  const endedThreeDaysAgoIso = new Date(now.getTime() - 3 * DAY_MS)
    .toISOString()
    .slice(0, 10);

  try {
    // 1. Unpaid 3+ days after registering.
    await dispatchCallsOfType(
      'payment_followup',
      await voiceRepository.selectPaymentFollowupRegistrations(threeDaysAgoIso, todayIso),
      null,
      earliestAt,
      summary,
    );

    // 2. Part Payment with the start date <= 3 days away.
    await dispatchCallsOfType(
      'bank_transfer_chase',
      await voiceRepository.selectBankTransferChaseRegistrations(
        todayIso,
        threeDaysAheadIso,
      ),
      null,
      earliestAt,
      summary,
    );

    // 3. Missed yesterday's session despite paying.
    await dispatchCallsOfType(
      'no_show_recovery',
      await voiceRepository.selectNoShowRegistrations(yesterdayIso),
      null,
      earliestAt,
      summary,
    );

    // 4. No feedback response 3 days after the course ended.
    await dispatchCallsOfType(
      'feedback_voice',
      await voiceRepository.selectFeedbackVoiceRegistrations(endedThreeDaysAgoIso),
      null,
      earliestAt,
      summary,
    );

    // 5. Course-interest matches an open batch.
    const upsellCandidates = await voiceRepository.selectUpsellCandidates(todayIso);
    const upsellVariables = new Map<string, Record<string, string>>(
      upsellCandidates.map((candidate) => [
        candidate.registrationId,
        {
          pitch_course_name: candidate.pitchCourseName,
          pitch_cohort_label: candidate.pitchCohortLabel,
          pitch_start_date: candidate.pitchStartDate,
          pitch_fee: formatGhs(candidate.pitchFee),
        },
      ]),
    );
    await dispatchCallsOfType(
      'upsell',
      upsellCandidates.map((candidate) => candidate.registrationId),
      upsellVariables,
      earliestAt,
      summary,
    );
  } catch (err) {
    summary.errors.push(String(err));
  }

  return summary;
}

// End-of-call report from Vapi. Normalizes the payload defensively (Vapi's
// message shapes vary between webhook versions) and writes results back.
export async function handleEndOfCallReport(payload: {
  vapiCallId: string;
  summary: string | null;
  transcript: string | null;
  structuredData: Record<string, unknown> | null;
  endedReason: string | null;
}): Promise<'updated' | 'unknown_call'> {
  const callLog = await voiceRepository.selectCallLogByVapiId(payload.vapiCallId);
  if (!callLog) return 'unknown_call';

  const data = payload.structuredData ?? {};
  const promisedPaymentDate =
    typeof data.promised_payment_date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(data.promised_payment_date)
      ? data.promised_payment_date
      : null;
  const bankReference =
    typeof data.bank_reference === 'string' && data.bank_reference.trim() !== ''
      ? data.bank_reference.trim().slice(0, 200)
      : null;
  const needsHumanFollowup = data.needs_human_followup === true;

  await voiceRepository.updateCallLog(callLog.id, {
    status: 'completed',
    summary: payload.summary,
    transcript: payload.transcript,
    needs_human_followup: needsHumanFollowup || callLog.needs_human_followup,
    ...(promisedPaymentDate ? { promised_payment_date: promisedPaymentDate } : {}),
    ...(bankReference ? { bank_reference: bankReference } : {}),
    ended_at: new Date().toISOString(),
  });

  // Voice-collected feedback flows into the same feedback table as the web
  // form (one per Registration — a duplicate means the form beat the call).
  //
  // Compatibility shim (2026-07-27 question redesign): the Vapi assistant's
  // own conversation script (configured in the Vapi dashboard, not in this
  // repo) still asks the old questions until someone updates it there. Four
  // fields are now required that Vapi doesn't send yet, so this derives
  // sensible defaults from the old fields it still has — remove the
  // fallbacks once the Vapi script is updated to ask the new questions
  // directly (it will then send the new field names and safeParse picks
  // them straight up, no code change needed here).
  if (callLog.call_type === 'feedback_voice' && callLog.registration_id) {
    const legacyRecommendRating =
      typeof data.recommend_rating === 'number' ? data.recommend_rating : null;
    const legacyTestimonialConsent = data.testimonial_consent === true;
    const legacyCommentsAnonymous = data.comments_anonymous === true;

    const parsed = feedbackSubmissionSchema.safeParse({
      overallRating: data.overall_rating,
      relevanceRating: data.relevance_rating ?? data.overall_rating,
      facilitatorRating: data.facilitator_rating,
      confidenceRating: data.confidence_rating ?? data.overall_rating,
      materialsClarity: data.materials_clarity ?? 'Yes',
      mostValuableText: typeof data.most_valuable_text === 'string' ? data.most_valuable_text : '',
      improvementText: typeof data.improvement_text === 'string' ? data.improvement_text : '',
      recommendation:
        data.recommendation ??
        (legacyRecommendRating === null
          ? 'Yes'
          : legacyRecommendRating >= 4
            ? 'Yes'
            : legacyRecommendRating === 3
              ? 'Maybe'
              : 'No'),
      otherCourseSuggestion:
        typeof data.other_course_suggestion === 'string' ? data.other_course_suggestion : '',
      testimonialChoice:
        data.testimonial_choice ??
        (legacyTestimonialConsent ? (legacyCommentsAnonymous ? 'Anonymous' : 'Named') : 'No'),
    });
    if (parsed.success) {
      try {
        await feedbackService.submitFeedback(callLog.registration_id, parsed.data);
      } catch (err) {
        // ALREADY_SUBMITTED is expected when the web form was used first.
        if (!(err instanceof Error && err.message.includes('already been submitted'))) {
          console.error('[voice feedback ingest]', err);
        }
      }
    }
  }

  return 'updated';
}

export async function recordInboundCall(input: {
  phone: string;
  summary: string | null;
  needsHumanFollowup: boolean;
}): Promise<void> {
  await voiceRepository.insertInboundCallLog({
    phone: input.phone,
    summary: input.summary,
    needs_human_followup: input.needsHumanFollowup,
  });
}

// Ad-hoc staff-triggered call (Admin Assistant tools, 2026-08-01) — same
// reserve-before-dial flow as dispatchCallsOfType, but for one registration,
// dialed immediately (no earliestAt scheduling window, since a human just
// asked for this call to happen now). Requires the Vapi outbound assistant's
// dashboard prompt to have an 'ad_hoc' branch that reads customMessage aloud
// — the call itself still places fine without it, it just won't say anything
// meaningful yet.
export async function callRegistrationAdHoc(
  registrationId: string,
  customMessage: string,
): Promise<{ vapiCallId: string }> {
  if (!isVoiceConfigured()) {
    throw new AppError('VOICE_NOT_CONFIGURED', 'Voice calling is not configured.', 400);
  }

  const contexts = await voiceRepository.selectCallContexts([registrationId]);
  const context = contexts.get(registrationId);
  if (!context || context.deleted) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  if (!normalizeCallPhone(context.phone)) {
    throw new AppError('VALIDATION_ERROR', 'This registrant has no valid phone number on file.', 400);
  }

  const reservation = await voiceRepository.reserveCallSlot(registrationId, 'ad_hoc', context.phone);
  if (reservation.outcome === 'duplicate') {
    throw new AppError('CONFLICT', 'A call is already in progress for this registrant.', 409);
  }

  try {
    const { vapiCallId } = await startOutboundCall({
      toPhone: context.phone,
      variableValues: {
        call_type: 'ad_hoc',
        participant_name: context.participantFirstName,
        custom_message: customMessage,
      },
    });
    await voiceRepository.updateCallLog(reservation.id, { vapi_call_id: vapiCallId, status: 'scheduled' });
    return { vapiCallId };
  } catch (err) {
    await voiceRepository
      .updateCallLog(reservation.id, { status: 'failed', summary: String(err) })
      .catch(() => undefined);
    throw err;
  }
}

// lookup_customer tool for the Vapi sales-follow-up agent (system review,
// 2026-07-22) — this app's registrations data IS the "CRM" the agent looks
// customers up in. Returns a short natural-language summary (matching the
// other tool handlers' string-return convention) rather than raw JSON,
// since it feeds straight into the assistant's spoken response.
export async function lookupCustomerForAgent(identifier: string): Promise<string> {
  const summary = await voiceRepository.selectCustomerSummaryByIdentifier(identifier);
  if (!summary) return 'No customer found with that email or phone number.';

  const profile =
    `${summary.fullName}, ${summary.email}, ${summary.phone}` +
    (summary.jobTitle ? `, ${summary.jobTitle}` : '') +
    (summary.company ? ` at ${summary.company}` : '');

  const registrationsText =
    summary.registrations.length === 0
      ? 'No course registrations on file.'
      : summary.registrations
          .map(
            (r) =>
              `${r.courseName} (${r.cohortLabel}): ${r.registrationStatus}, payment ${r.paymentStatus}` +
              (r.balance > 0 ? `, balance owing GHS ${r.balance}` : ''),
          )
          .join('. ');

  return `${profile}. ${registrationsText}`;
}

// Staff review (RLS enforces admin/finance/management).
export async function getRecentCalls(limit = 100): Promise<CallLogView[]> {
  const rows = await voiceRepository.selectRecentCalls(limit);
  return rows.map((row) => ({
    id: row.id,
    registrationId: row.registration_id,
    participantName: row.participant_name,
    callType: row.call_type as VoiceCallType,
    phone: row.phone,
    status: row.status,
    summary: row.summary,
    transcript: row.transcript,
    needsHumanFollowup: row.needs_human_followup,
    promisedPaymentDate: row.promised_payment_date,
    bankReference: row.bank_reference,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  }));
}
