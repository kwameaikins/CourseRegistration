import { handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';

export async function GET() {
  try {
    const deadlines = await newsInsightsService.listUpcomingDeadlines();
    return successResponse({ deadlines });
  } catch (err) {
    return handleRouteError(err);
  }
}
