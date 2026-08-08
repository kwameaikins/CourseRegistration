import { captureToSentry, errorResponse, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';

// GET /api/cron/attendance — Zoom attendance sync (Option 2), triggered daily
// at 21:00 UTC by Vercel Cron, after class sessions have ended (Ghana is
// UTC+0). Idempotent: unique(registration_id, session_date) makes re-runs
// safe.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const summary = await attendanceService.runAttendanceSync();
    // Close the classroom for courses that finished (2026-08-08). Runs AFTER
    // the sync above, and only touches batches whose end_date is at least two
    // days past — the sync itself still covers end_date + 1, and it matches
    // participants on the very registrant records this revokes.
    const zoomRevocation = await attendanceService.runPostCourseZoomRevocation();
    if (zoomRevocation.errors.length > 0) {
      captureToSentry(
        new Error(
          `Post-course Zoom revocation had ${zoomRevocation.errors.length} error(s): ${zoomRevocation.errors.join(' | ')}`,
        ),
        { job: 'cron_attendance', outcome: 'zoom_revocation_partial_failure' },
      );
      console.error('[cron attendance zoom revocation]', zoomRevocation.errors.join(' | '));
    }
    // A per-batch failure is collected into summary.errors rather than thrown,
    // so without this the job reports 200/OK while writing nothing — which is
    // exactly how a missing Zoom scope went unnoticed from 2026-07-19 to
    // 2026-08-06. Surface it to Sentry with the same weight as a crash.
    if (summary.errors.length > 0) {
      const err = new Error(
        `Attendance sync completed with ${summary.errors.length} batch error(s): ${summary.errors.join(' | ')}`,
      );
      captureToSentry(err, { job: 'cron_attendance', outcome: 'partial_failure' });
      console.error('[cron attendance]', err.message);
    }
    return successResponse({ ...summary, zoomRevocation });
  } catch (err) {
    captureToSentry(err, { job: 'cron_attendance' });
    console.error('[cron attendance]', err);
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Attendance sync failed.' },
      500,
    );
  }
}
