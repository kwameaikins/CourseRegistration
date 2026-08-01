import { handleRouteError, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';

// GET /api/attendance/exceptions?status=pending — tutor-raised no-show
// flags and correction requests. Admin/management gate lives in the
// service (matches the /attendance screen's role gate).
export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get('status') as
      | 'pending'
      | 'approved'
      | 'rejected'
      | null;
    const exceptions = await attendanceService.listAttendanceExceptions(
      status ? { status } : undefined,
    );
    return successResponse({ exceptions });
  } catch (err) {
    return handleRouteError(err);
  }
}
