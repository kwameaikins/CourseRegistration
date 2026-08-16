import { handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';

// GET /api/courses/content — every course with its public copy resolved,
// database first and the code map as fallback. Read is open to the same roles
// as GET /api/courses; only writing is admin-only.
export async function GET() {
  try {
    await usersService.requireRole(['admin', 'finance', 'marketing', 'management']);
    const records = await coursesService.getCourseContentRecords();
    return successResponse({ records });
  } catch (err) {
    return handleRouteError(err);
  }
}
