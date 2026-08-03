import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';
import { updateNewsSourceInputSchema } from '@/modules/news-insights/types';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = updateNewsSourceInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid source update payload.', 400);
    }
    const source = await newsInsightsService.updateSource(id, parsed.data);
    return successResponse({ source });
  } catch (err) {
    return handleRouteError(err);
  }
}
