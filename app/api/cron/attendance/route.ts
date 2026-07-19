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
    return successResponse(summary);
  } catch (err) {
    captureToSentry(err, { job: 'cron_attendance' });
    console.error('[cron attendance]', err);
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Attendance sync failed.' },
      500,
    );
  }
}
