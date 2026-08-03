import { handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';

// GET /api/news-pipeline/cost-summary — doc Section 10's cost model, made
// measurable instead of estimated via agent_run_log.
export async function GET() {
  try {
    const summary = await newsInsightsService.getCostSummary();
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
