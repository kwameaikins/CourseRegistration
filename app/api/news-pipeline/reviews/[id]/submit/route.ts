import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as newsInsightsService from '@/modules/news-insights/service';
import { submitReviewInputSchema } from '@/modules/news-insights/types';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = submitReviewInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid review submission.', 400);
    }
    const review = await newsInsightsService.submitReview(id, parsed.data);
    return successResponse({ review });
  } catch (err) {
    return handleRouteError(err);
  }
}
