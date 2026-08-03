import { handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';
import { listPublishedArticlesFiltersSchema } from '@/modules/news-insights/types';

// GET /api/news/articles — public, unauthenticated. Category/search filters
// follow the same server-side ilike pattern as the Leads screen (no
// full-text search infra needed at this volume).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = listPublishedArticlesFiltersSchema.parse({
      category: url.searchParams.get('category') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });
    const articles = await newsInsightsService.listPublishedArticles(filters);
    return successResponse({ articles });
  } catch (err) {
    return handleRouteError(err);
  }
}
