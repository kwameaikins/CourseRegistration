import { handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const article = await newsInsightsService.getPublishedArticleBySlug(slug);
    return successResponse({ article });
  } catch (err) {
    return handleRouteError(err);
  }
}
