// Post-course feedback business rules (founder-approved 2026-07-19).
//
// The unguessable Registration UUID is the public form's access token. One
// submission per Registration (DB unique constraint). The request email
// (post_training_thankyou) goes out the morning after the Batch end_date via
// the daily cron, deduplicated by the email engine (BR-07).
import { AppError } from '@/lib/errors';
import * as feedbackRepository from '@/modules/feedback/repository';
import * as communicationsService from '@/modules/communications/service';
import type {
  BatchFeedbackSummary,
  FeedbackDispatchSummary,
  FeedbackSubmissionInput,
  PublicFeedbackContext,
} from '@/modules/feedback/types';

export async function getPublicFeedbackContext(
  registrationId: string,
): Promise<PublicFeedbackContext> {
  const context = await feedbackRepository.selectPublicFeedbackContext(registrationId);
  // A deleted (DPA-erased) participant's link goes dark like an invalid one.
  if (!context || context.participantDeleted) {
    throw new AppError('NOT_FOUND', 'This feedback link is not valid.', 404);
  }
  return {
    courseName: context.courseName,
    cohortLabel: context.cohortLabel,
    participantFirstName: context.participantFirstName,
    alreadySubmitted: context.alreadySubmitted,
    courseOptions: await feedbackRepository.selectCourseNames(),
  };
}

export async function submitFeedback(
  registrationId: string,
  input: FeedbackSubmissionInput,
): Promise<void> {
  const context = await feedbackRepository.selectPublicFeedbackContext(registrationId);
  if (!context || context.participantDeleted) {
    throw new AppError('NOT_FOUND', 'This feedback link is not valid.', 404);
  }

  const outcome = await feedbackRepository.insertFeedback({
    registration_id: registrationId,
    overall_rating: input.overallRating,
    facilitator_rating: input.facilitatorRating,
    recommend_rating: input.recommendRating,
    improvement_text: input.improvementText || null,
    testimonial_consent: input.testimonialConsent,
    comments_anonymous: input.commentsAnonymous,
    interested_courses:
      input.interestedCourses.length > 0 ? input.interestedCourses.join(', ') : null,
  });
  if (outcome === 'duplicate') {
    throw new AppError(
      'ALREADY_SUBMITTED',
      'Feedback for this registration has already been submitted — thank you!',
      409,
    );
  }
}

// Pure due-date rule, exported for tests: requests go out when the Batch
// ended exactly one day before `now`.
export function feedbackRequestDateFor(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Called from the daily reminders cron (Vercel Hobby allows 2 cron jobs, both
// taken). Idempotent: sendEmailOnce's email_log dedup means batches evaluated
// twice never email twice.
export async function runFeedbackRequestDispatch(
  now = new Date(),
): Promise<FeedbackDispatchSummary> {
  const targetEndDate = feedbackRequestDateFor(now);
  const summary: FeedbackDispatchSummary = {
    date: targetEndDate,
    batchesEvaluated: 0,
    emailsSent: 0,
    skipped: 0,
    errors: [],
  };

  const batches = await feedbackRepository.selectBatchesEndedOn(targetEndDate);
  for (const batch of batches) {
    summary.batchesEvaluated += 1;
    try {
      const registrationIds =
        await feedbackRepository.selectPaidRegistrationIdsForBatch(batch.id);
      for (const registrationId of registrationIds) {
        const outcome = await communicationsService.sendEmailOnce(
          registrationId,
          'post_training_thankyou',
        );
        if (outcome === 'sent') summary.emailsSent += 1;
        else if (outcome === 'failed') {
          summary.errors.push(`${registrationId}: send failed`);
        } else {
          summary.skipped += 1;
        }
      }
    } catch (err) {
      summary.errors.push(`${batch.id}: ${String(err)}`);
    }
  }
  return summary;
}

// Staff review (RLS enforces admin/management).
export async function getBatchFeedbackSummary(
  batchId: string,
): Promise<BatchFeedbackSummary> {
  const [rows, paidRegistrations] = await Promise.all([
    feedbackRepository.selectFeedbackForBatch(batchId),
    feedbackRepository.countPaidRegistrationsForBatch(batchId),
  ]);

  const average = (values: number[]): number | null =>
    values.length === 0
      ? null
      : Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;

  return {
    responses: rows.length,
    paidRegistrations,
    averageOverall: average(rows.map((r) => r.overall_rating)),
    averageFacilitator: average(rows.map((r) => r.facilitator_rating)),
    averageRecommend: average(rows.map((r) => r.recommend_rating)),
    rows: rows.map((row) => ({
      registrationId: row.registration_id,
      participantName: row.participant_name,
      overallRating: row.overall_rating,
      facilitatorRating: row.facilitator_rating,
      recommendRating: row.recommend_rating,
      improvementText: row.improvement_text,
      testimonialConsent: row.testimonial_consent,
      commentsAnonymous: row.comments_anonymous,
      interestedCourses: row.interested_courses,
      submittedAt: row.submitted_at,
    })),
  };
}
