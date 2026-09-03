import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as sequencesService from '@/modules/sequences/service';
import { updateSequenceInputSchema } from '@/modules/sequences/types';

// PATCH /api/sequences/[id] — activate/deactivate or rename a sequence.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSequenceInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid sequence payload.', 400);
    }
    await sequencesService.updateSequence(id, parsed.data);
    return successResponse({ updated: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
