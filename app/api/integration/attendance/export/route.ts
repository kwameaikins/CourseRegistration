import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';

// GET /api/integration/attendance/export[?batchId=] - every attendance row, for the
// LMS import (attendance history moves to the LMS). Ids and times only. Same service
// key as the feedback export; 401 before any read.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    const batchId = new URL(request.url).searchParams.get('batchId') || undefined;
    return successResponse(await attendanceService.exportAttendanceForLms(batchId));
  } catch (err) {
    return handleRouteError(err);
  }
}
