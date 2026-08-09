import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as feedbackService from '@/modules/feedback/service';

// POST /api/feedback/attendees — send a batch's attendees the post-course
// thank-you / feedback request. Admin only, via the staff session.
//
// The sibling route under /api/cron is authenticated with CRON_SECRET, which
// Vercel marks sensitive and will not disclose on `env pull`. That makes it
// unusable to anyone who does not already hold the value — including an admin
// sitting in the app, who should not need a shared secret to do this.
//
// Body: { batchId: string, dryRun?: boolean }
// dryRun defaults to TRUE in the service: this sends real email to real
// people, so the caller has to ask for the send explicitly.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { batchId?: string; dryRun?: boolean };
    if (!body.batchId) {
      throw new AppError('VALIDATION_ERROR', 'A batch is required.', 400);
    }

    const result = await feedbackService.runFeedbackRequestForAttendeesAsStaff({
      batchId: body.batchId,
      dryRun: body.dryRun,
    });
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
