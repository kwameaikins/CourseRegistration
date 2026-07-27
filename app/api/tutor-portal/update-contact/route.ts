import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE, updateTutorContactSchema } from '@/modules/tutors/types';

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = updateTutorContactSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid contact details.', 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    await tutorsService.updateTutorContact(sessionId, parsed.data);

    return successResponse({ updated: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
