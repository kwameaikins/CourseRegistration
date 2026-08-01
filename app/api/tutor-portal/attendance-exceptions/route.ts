import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE, flagAttendanceExceptionSchema } from '@/modules/tutors/types';

// POST /api/tutor-portal/attendance-exceptions — a tutor flags a no-show or
// requests an attendance correction on their own batch's roster. Always
// starts pending; only staff review (see /api/attendance/exceptions) can
// change attendance data (BR-34).
export async function POST(request: Request) {
  try {
    const parsed = flagAttendanceExceptionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid attendance exception payload.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    await tutorsService.flagAttendanceException(sessionId, parsed.data);
    return successResponse({ status: 'ok' }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
