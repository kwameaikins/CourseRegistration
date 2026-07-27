import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { updateTutorInputSchema } from '@/modules/tutors/types';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = updateTutorInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid tutor payload.', 400);
    }
    const tutor = await tutorsService.updateTutor(id, parsed.data);
    return successResponse(tutor);
  } catch (err) {
    return handleRouteError(err);
  }
}
