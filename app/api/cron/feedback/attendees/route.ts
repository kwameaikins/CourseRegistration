import { captureToSentry, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as feedbackService from '@/modules/feedback/service';

// POST /api/cron/feedback/attendees — send the post-course thank-you /
// feedback request to a Batch's ATTENDEES only.
//
// Manual trigger (deliberately absent from vercel.json's cron list). The
// nightly dispatch in /api/cron/reminders targets paid registrations of
// batches that ended yesterday, which on a free Batch is everyone who ever
// registered; this targets the people whose attendance clears
// MIN_ATTENDANCE_RATIO, so the template's "your certificate will be sent once
// your feedback is received" is a promise that can actually be kept.
//
// Body: { batchId: string, dryRun?: boolean }
// dryRun defaults to TRUE — this sends real email to real people.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const body = (await request.json()) as { batchId?: string; dryRun?: boolean };
    if (!body.batchId) {
      return errorResponse({ code: 'VALIDATION_ERROR', message: 'batchId is required.' }, 400);
    }

    const result = await feedbackService.runFeedbackRequestForAttendees({
      batchId: body.batchId,
      dryRun: body.dryRun,
    });
    if (result.errors.length > 0) {
      captureToSentry(
        new Error(`Attendee feedback dispatch errors: ${result.errors.join(' | ')}`),
        { job: 'feedback_attendees', outcome: 'partial_failure' },
      );
    }
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
