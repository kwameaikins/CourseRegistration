import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';
import { createCorrectionInputSchema } from '@/modules/news-insights/types';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = createCorrectionInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid correction payload.', 400);
    }
    await newsInsightsService.addCorrection(id, parsed.data);
    return successResponse({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
