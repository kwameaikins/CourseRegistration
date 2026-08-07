import { captureToSentry, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';

// POST /api/cron/attendance/backfill — recover a Batch whose sessions ran
// while the nightly sync was failing.
//
// Manual trigger only (deliberately absent from vercel.json's cron list).
// The nightly sync only ever considers batches still in progress, so once a
// Batch's window closes its attendance is unrecoverable without this.
//
// Same CRON_SECRET trust boundary as the sync it repairs — both write
// attendance from the same Zoom source, so a separate credential would add
// ceremony without adding safety.
//
// Body: { batchId: string, dates?: string[], dryRun?: boolean }
// dryRun defaults to TRUE — matching for a shared-link session leans on
// display names, so the result is meant to be reviewed before it is written.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const body = (await request.json()) as {
      batchId?: string;
      dates?: string[];
      dryRun?: boolean;
      minSharedTokens?: number;
    };
    if (!body.batchId) {
      return errorResponse(
        { code: 'VALIDATION_ERROR', message: 'batchId is required.' },
        400,
      );
    }
    if (body.minSharedTokens !== undefined && body.minSharedTokens !== 1 && body.minSharedTokens !== 2) {
      return errorResponse(
        { code: 'VALIDATION_ERROR', message: 'minSharedTokens must be 1 or 2.' },
        400,
      );
    }

    const result = await attendanceService.runAttendanceBackfill({
      batchId: body.batchId,
      dates: body.dates,
      dryRun: body.dryRun,
      minSharedTokens: body.minSharedTokens as 1 | 2 | undefined,
    });
    if (result.errors.length > 0) {
      captureToSentry(
        new Error(`Attendance backfill errors: ${result.errors.join(' | ')}`),
        { job: 'attendance_backfill', outcome: 'partial_failure' },
      );
    }
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
