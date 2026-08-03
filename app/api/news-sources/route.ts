import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';
import { createNewsSourceInputSchema } from '@/modules/news-insights/types';

// GET/POST /api/news-sources — the Editorial Dashboard's Source registry.
// No sources are pre-seeded anywhere in this app; this is the only way real
// ones get in.
export async function GET() {
  try {
    const sources = await newsInsightsService.listSources();
    return successResponse({ sources });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createNewsSourceInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid source payload.', 400);
    }
    const source = await newsInsightsService.createSource(parsed.data);
    return successResponse({ source }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
