import { captureToSentry, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';

// POST /api/cron/zoom/registrants/backfill — diagnose and repair a Batch whose
// settled registrants never received a personal Zoom join link.
//
// Manual trigger only (deliberately absent from vercel.json's cron list), same
// CRON_SECRET trust boundary as the attendance backfill it sits beside.
//
// Body: { batchId: string, dryRun?: boolean, enableRegistration?: boolean }
//
// dryRun defaults to TRUE. Run it that way FIRST: the response's
// registrationEnabled/approvalType fields are usually the entire diagnosis, and
// they cost nothing to read. approval_type 2 means the meeting does not accept
// registrants at all, which is the state a meeting created by hand in the Zoom
// console defaults to — and no scope grant changes it.
//
// enableRegistration is opt-in and only acts on a real run. Turning
// registration on changes what the meeting's existing SHARED join link does for
// everyone already holding it, so for a cohort mid-course it is a live
// behaviour change and belongs to a human with the schedule in front of them.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const body = (await request.json()) as {
      batchId?: string;
      dryRun?: boolean;
      enableRegistration?: boolean;
    };
    if (!body.batchId) {
      return errorResponse({ code: 'VALIDATION_ERROR', message: 'batchId is required.' }, 400);
    }

    const result = await attendanceService.runZoomRegistrantBackfill({
      batchId: body.batchId,
      dryRun: body.dryRun,
      enableRegistration: body.enableRegistration,
    });
    if (result.errors.length > 0) {
      captureToSentry(
        new Error(`Zoom registrant backfill: ${result.errors.join(' | ')}`),
        { job: 'zoom_registrant_backfill', batchId: body.batchId },
      );
    }
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
