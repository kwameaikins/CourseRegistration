import { handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';

// GET /api/news-pipeline/jobs — Editorial Dashboard queue view, backed by
// pipeline_jobs (doc Section 17: newly collected, duplicate detected,
// researching, verification required, draft ready, human review required,
// approved, scheduled, published, developing, correction required,
// rejected — grouped client-side from the stage column).
export async function GET() {
  try {
    const jobs = await newsInsightsService.listPipelineJobs();
    return successResponse({ jobs });
  } catch (err) {
    return handleRouteError(err);
  }
}
