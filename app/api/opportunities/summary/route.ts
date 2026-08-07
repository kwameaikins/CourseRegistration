import { parseDateRange } from '@/lib/date-range';
import { handleRouteError, successResponse } from '@/lib/errors';
import * as opportunitiesService from '@/modules/opportunities/service';
import * as usersService from '@/modules/users/service';

// Takes the same dateFrom / dateTo as /api/opportunities so the summary tiles
// and the list they sit above always describe the same set of rows.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const range = parseDateRange(new URL(request.url).searchParams);
    const summary = await opportunitiesService.getPipelineSummary(range);
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
