// Post-course feedback business rules (founder-approved 2026-07-19).
//
// The unguessable Registration UUID is the public form's access token. One
// submission per Registration (DB unique constraint). The request email
// (post_training_thankyou) goes out the morning after the Batch end_date via
// the daily cron, deduplicated by the email engine (BR-07).
import { AppError } from '@/lib/errors';
import * as feedbackRepository from '@/modules/feedback/repository';
import * as communicationsService from '@/modules/communications/service';
import * as certificatesService from '@/modules/certificates/service';
import * as usersService from '@/modules/users/service';
import type {
  BatchFeedbackSummary,
  FeedbackDispatchSummary,
  FeedbackSubmissionInput,
  FeedbackSubmissionResult,
  PublicFeedbackContext,
} from '@/modules/feedback/types';

// Public star ratings are re-exported so this module stays the one door into
// feedback, but they LIVE in course-ratings.ts — a light module importing only
// the repository. The catalogue reads them on every public page render and must
// not drag in communications, certificates and users to draw five stars.
export {
  getPublishableCourseRatingsByCourseIdSystem,
  MIN_RATINGS_TO_PUBLISH,
} from '@/modules/feedback/course-ratings';
export type { CourseRating } from '@/modules/feedback/course-ratings';

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
  };
}

// Certificate auto-issue (founder-approved 2026-07-27): the moment a Paid
// participant submits feedback, they get their certificate immediately — no
// staff step. Never allowed to fail the feedback submission itself (same
// non-blocking posture as every other side-effect in this codebase).
export async function submitFeedback(
  registrationId: string,
  input: FeedbackSubmissionInput,
): Promise<FeedbackSubmissionResult> {
  const context = await feedbackRepository.selectPublicFeedbackContext(registrationId);
  if (!context || context.participantDeleted) {
    throw new AppError('NOT_FOUND', 'This feedback link is not valid.', 404);
  }

  const outcome = await feedbackRepository.insertFeedback({
    registration_id: registrationId,
    overall_rating: input.overallRating,
    relevance_rating: input.relevanceRating,
    facilitator_rating: input.facilitatorRating,
    confidence_rating: input.confidenceRating,
    materials_clarity: input.materialsClarity,
    most_valuable_text: input.mostValuableText || null,
    improvement_text: input.improvementText || null,
    recommendation: input.recommendation,
    other_course_suggestion: input.otherCourseSuggestion || null,
    testimonial_choice: input.testimonialChoice,
  });
  if (outcome === 'duplicate') {
    throw new AppError(
      'ALREADY_SUBMITTED',
      'Feedback for this registration has already been submitted — thank you!',
      409,
    );
  }

  try {
    const certificate = await certificatesService.issueCertificateIfEligible(registrationId);
    return {
      certificateIssued: certificate !== null,
      certificateDownloadUrl: certificate ? certificatesService.downloadUrlFor(certificate.id) : null,
    };
  } catch (err) {
    console.error('[feedback auto-issue certificate]', err);
    return { certificateIssued: false, certificateDownloadUrl: null };
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
      // Who can this email honestly promise a certificate to? Exactly the
      // condition isCertificateEligible applies (certificates/service.ts): on a
      // paid Batch payment is the gate and attendance is irrelevant; on a free
      // Batch every registration auto-settles to Paid, so attendance is the
      // gate instead. Targeting paid registrations on a free Batch mailed the
      // certificate-for-feedback promise to people who never joined —
      // 185 of the 267 on ESG2 (2026-08-06).
      //
      // Deliberately NOT gated on attendance for paid batches: attendance can
      // legitimately be empty there (the Zoom sync only started writing rows
      // on 2026-08-06), and suppressing those requests would lose real
      // feedback for no benefit — a paid participant earns their certificate
      // whether or not the sync saw them.
      const registrationIds = batch.is_free
        ? await feedbackRepository.selectAttendedRegistrationIdsForBatch(batch.id)
        : await feedbackRepository.selectPaidRegistrationIdsForBatch(batch.id);
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

export interface AttendeeFeedbackDispatchResult {
  batchId: string;
  dryRun: boolean;
  attendedRegistrations: number;
  emailsSent: number;
  skipped: number;
  errors: string[];
}

// Sends the post-course thank-you / feedback request to the people who
// actually attended, rather than everyone who registered.
//
// runFeedbackRequestDispatch above targets PAID registrations of batches that
// ended yesterday. On a free Batch every registration settles to Paid the
// moment it is created, so that dispatch mails everyone who ever filled in the
// form — including people who never joined. The template promises "your
// certificate will be sent once your feedback is received", which since the
// attendance-rate rule (2026-08-06) is a promise the system cannot keep for a
// non-attendee.
//
// Manual trigger, and idempotent: sendEmailOnce's email_log dedup means anyone
// already mailed by the nightly dispatch is skipped rather than mailed twice.
export async function runFeedbackRequestForAttendees(params: {
  batchId: string;
  dryRun?: boolean;
}): Promise<AttendeeFeedbackDispatchResult> {
  const dryRun = params.dryRun ?? true;
  const registrationIds = await feedbackRepository.selectAttendedRegistrationIdsForBatch(
    params.batchId,
  );
  const result: AttendeeFeedbackDispatchResult = {
    batchId: params.batchId,
    dryRun,
    attendedRegistrations: registrationIds.length,
    emailsSent: 0,
    skipped: 0,
    errors: [],
  };
  if (dryRun) return result;

  for (const registrationId of registrationIds) {
    try {
      const outcome = await communicationsService.sendEmailOnce(
        registrationId,
        'post_training_thankyou',
      );
      if (outcome === 'sent') result.emailsSent += 1;
      else if (outcome === 'failed') result.errors.push(`${registrationId}: send failed`);
      else result.skipped += 1;
    } catch (err) {
      result.errors.push(`${registrationId}: ${String(err)}`);
    }
  }
  return result;
}

// Staff-triggered variant of the dispatch above (2026-08-09).
//
// The existing trigger is POST /api/cron/feedback/attendees, authenticated
// with CRON_SECRET — which is marked sensitive in Vercel and therefore
// cannot be read back out, so in practice nobody could run it without
// already knowing the value. An admin sitting in the app should not need a
// shared secret to send a batch its feedback request.
export async function runFeedbackRequestForAttendeesAsStaff(params: {
  batchId: string;
  dryRun?: boolean;
}): Promise<AttendeeFeedbackDispatchResult> {
  await usersService.requireRole(['admin']);
  return runFeedbackRequestForAttendees(params);
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

  const recommendationBreakdown = { yes: 0, maybe: 0, no: 0 };
  for (const row of rows) {
    if (row.recommendation === 'Yes') recommendationBreakdown.yes += 1;
    else if (row.recommendation === 'Maybe') recommendationBreakdown.maybe += 1;
    else recommendationBreakdown.no += 1;
  }

  return {
    responses: rows.length,
    paidRegistrations,
    averageOverall: average(rows.map((r) => r.overall_rating)),
    averageRelevance: average(rows.map((r) => r.relevance_rating)),
    averageFacilitator: average(rows.map((r) => r.facilitator_rating)),
    averageConfidence: average(rows.map((r) => r.confidence_rating)),
    recommendationBreakdown,
    rows: rows.map((row) => ({
      registrationId: row.registration_id,
      participantName: row.participant_name,
      overallRating: row.overall_rating,
      relevanceRating: row.relevance_rating,
      facilitatorRating: row.facilitator_rating,
      confidenceRating: row.confidence_rating,
      materialsClarity: row.materials_clarity as 'Yes' | 'Partly' | 'No',
      mostValuableText: row.most_valuable_text,
      improvementText: row.improvement_text,
      recommendation: row.recommendation as 'Yes' | 'Maybe' | 'No',
      otherCourseSuggestion: row.other_course_suggestion,
      testimonialChoice: row.testimonial_choice as 'Named' | 'Anonymous' | 'No',
      submittedAt: row.submitted_at,
    })),
  };
}

export interface PublishableTestimonial {
  quote: string;
  // Null for a participant who consented anonymously — the catalogue renders
  // "Anonymous Participant" rather than inventing an attribution.
  attributedName: string | null;
  courseName: string;
  overallRating: number;
}

// Consented testimonials for the public course catalogue (2026-08-03). No role
// gate on purpose — this feeds a page with no session — but the repository
// filters hard on testimonial consent and erasure status, so nothing reaches
// here that a participant did not agree to publish.
//
// Returns an empty array when nobody has consented yet, and the catalogue
// hides the section entirely rather than showing placeholder quotes. Fabricated
// social proof on a page selling professional certification is not a
// placeholder problem, it's a credibility problem.
//
// PUBLISHING RULES (founder-directed 2026-08-17, after a quote reading "NA"
// appeared on the live home page).
//
// The quote is the participant's answer to "what was most valuable?" — a
// feedback question, not a testimonial box. Most answers are usable; some are
// "NA", a three-word fragment, or attached to a two-star rating. The staff
// feedback screen should show every one of them. A marketing page should not.
// Consent alone was never enough to make an answer worth quoting.
const MIN_TESTIMONIAL_LENGTH = 40;
const MIN_TESTIMONIAL_RATING = 4;

// Answers that mean "I have nothing to say", not praise. Anchored so it can
// only ever match a whole answer — a real testimonial beginning with the word
// "No" must survive.
const PLACEHOLDER_ANSWER = /^(n\/?a|none|nil|nothing|no comment|no|-+|\.+)$/i;

export function isPublishableTestimonial(candidate: {
  quote: string;
  overallRating: number;
}): boolean {
  const quote = candidate.quote.trim();
  if (quote.length < MIN_TESTIMONIAL_LENGTH) return false;
  if (PLACEHOLDER_ANSWER.test(quote)) return false;
  // Quoting a two-star review as marketing is both odd and a little dishonest.
  if (candidate.overallRating < MIN_TESTIMONIAL_RATING) return false;
  return true;
}

export async function getPublishableTestimonials(
  limit = 6,
): Promise<PublishableTestimonial[]> {
  // Ask for far more than we need: the rules below reject a good proportion,
  // and asking for exactly `limit` would leave the page short.
  const candidates = await feedbackRepository.selectPublishableTestimonialsSystem(60);

  return candidates
    .filter(isPublishableTestimonial)
    .sort((a, b) => {
      // Named quotes first. An attributed testimonial is real proof;
      // "Anonymous participant" persuades nobody, and we hold 10 named ones.
      const byAttribution =
        Number(Boolean(b.attributedName)) - Number(Boolean(a.attributedName));
      if (byAttribution !== 0) return byAttribution;
      return b.overallRating - a.overallRating;
      // Sort is stable, so equal-ranked quotes keep the repository's
      // most-recent-first order.
    })
    .slice(0, limit);
}
