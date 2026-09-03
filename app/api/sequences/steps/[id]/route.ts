import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as sequencesService from '@/modules/sequences/service';
import { updateStepInputSchema } from '@/modules/sequences/types';

// PATCH /api/sequences/steps/[id] — edit one step's timing or copy.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateStepInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid step payload.', 400);
    }
    await sequencesService.updateStep(id, parsed.data);
    return successResponse({ updated: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
