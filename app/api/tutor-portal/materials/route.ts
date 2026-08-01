import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE, addTutorSessionMaterialSchema } from '@/modules/tutors/types';

// POST /api/tutor-portal/materials — a tutor shares a material link
// (slides/agenda/readings) for one of their own batches. Link-based, no
// file upload (see modules/live-sessions/repository.ts).
export async function POST(request: Request) {
  try {
    const parsed = addTutorSessionMaterialSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid material payload.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const material = await tutorsService.addMaterialForBatch(sessionId, parsed.data);
    return successResponse(material, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
