import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';
import * as usersService from '@/modules/users/service';

// GET /api/attendance?batchId=... — Zoom attendance per Batch (Option 2).
// Admin + Management, matching the attendance RLS read policy.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'management']);
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) {
      throw new AppError('VALIDATION_ERROR', 'batchId is required.', 400);
    }
    const attendance = await attendanceService.getAttendanceForBatch(batchId);
    return successResponse({ attendance });
  } catch (err) {
    return handleRouteError(err);
  }
}
