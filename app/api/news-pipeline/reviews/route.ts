import { handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';

// GET /api/news-pipeline/reviews — pending Level 2 human-review queue
// (doc Section 5). Level 3 stories never appear here — they're blocked
// outright, requiring explicit founder/senior-editor sign-off not built in
// this pass (Phase 1 scope note in the companion doc).
export async function GET() {
  try {
    const reviews = await newsInsightsService.listPendingReviews();
    return successResponse({ reviews });
  } catch (err) {
    return handleRouteError(err);
  }
}
