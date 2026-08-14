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
// dryRun defaults to TRUE.
//
// IMPORTANT: registrationEnabled/approvalType are usually UNKNOWN (null), not
// because the meeting is fine but because this app has no Zoom `meeting:read`
// scope — GET /meetings/{id} 400s. `registrationStateReadable: false` says so
// explicitly. Do not read a null as "registration is on".
//
// enableRegistration turns registration on for the meeting. Opt-in, ignored on
// a dry run, and idempotent (safe when it is already on — which is just as well,
// since we usually cannot check). It changes what the meeting's existing SHARED
// join link does for anyone already holding it, so on a cohort mid-course it is
// a live behaviour change for real students.
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
