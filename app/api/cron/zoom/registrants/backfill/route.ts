import { captureToSentry, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';

// POST /api/cron/zoom/registrants/backfill — diagnose and repair a Batch whose
// settled registrants never received a personal Zoom join link.
//
// Manual trigger only (deliberately absent from vercel.json's cron list), same
// CRON_SECRET trust boundary as the attendance backfill it sits beside.
//
// Body: { batchId: string, dryRun?: boolean }
//
// dryRun defaults to TRUE. Run it that way FIRST: the response's
// registrationEnabled/approvalType fields are usually the entire diagnosis, and
// they cost nothing to read. approval_type 2 means the meeting does not accept
// registrants at all, which is the state a meeting created by hand in the Zoom
// console defaults to — and no scope grant changes it.
//
// This route READS Zoom meeting settings and WRITES registrants. It cannot
// modify a meeting: an existing Zoom meeting is never altered by this
// application (founder decision 2026-08-14). An earlier version accepted an
// enableRegistration flag that would have PATCHed the meeting; it was removed
// rather than documented, because a standing "never" alongside a live parameter
// that does it anyway is how the never gets broken by accident.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const body = (await request.json()) as {
      batchId?: string;
      dryRun?: boolean;
    };
    if (!body.batchId) {
      return errorResponse({ code: 'VALIDATION_ERROR', message: 'batchId is required.' }, 400);
    }

    const result = await attendanceService.runZoomRegistrantBackfill({
      batchId: body.batchId,
      dryRun: body.dryRun,
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
