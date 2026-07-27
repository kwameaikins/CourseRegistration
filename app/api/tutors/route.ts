import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { createTutorInputSchema } from '@/modules/tutors/types';

// GET /api/tutors — admin/management (staff CRUD gate lives in the service).
export async function GET() {
  try {
    const tutors = await tutorsService.listTutorsWithBatchCounts();
    return successResponse({ tutors });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createTutorInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid tutor payload.', 400);
    }
    const tutor = await tutorsService.createTutor(parsed.data);
    return successResponse(tutor, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
