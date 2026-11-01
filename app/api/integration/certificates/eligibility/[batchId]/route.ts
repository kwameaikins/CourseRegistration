import { AppError, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';

// GET /api/integration/certificates/eligibility/{batchId} — who Registration itself considers
// eligible for a certificate on this batch, with the inputs it used. A pure read, for the LMS's
// eligibility replay (lms-feedback-eligibility plan, Task 7). The rule is
// `getBatchIssueContextSystem`'s (BR-46), not a second copy; `eligibleRegistrationIds` is the rule's
// verdict with "already issued" left out, so a batch whose certificates are out still compares.
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    const { batchId } = await context.params;
    const issue = await certificatesService.getBatchIssueContextSystem(batchId);
    if (!issue) throw new AppError('NOT_FOUND', 'Batch not found.', 404);
    return successResponse({
      batchId,
      batchIsFree: issue.batchIsFree,
      eligibleRegistrationIds: issue.candidates
        .filter((candidate) => candidate.ruleEligible)
        .map((candidate) => candidate.registrationId),
      candidates: issue.candidates.map((candidate) => ({
        registrationId: candidate.registrationId,
        paid: candidate.paid,
        attendedSessions: candidate.attendedSessions,
        feedback: candidate.feedbackSubmitted,
        submitted: candidate.assignmentSubmitted,
        alreadyIssued: candidate.alreadyIssued,
        eligible: candidate.ruleEligible,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}