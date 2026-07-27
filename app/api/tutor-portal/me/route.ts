import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

// GET /api/tutor-portal/me — the tutor dashboard payload for the current session.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const dashboard = await tutorsService.getTutorPortalDashboard(sessionId);
    return successResponse(dashboard);
  } catch (err) {
    return handleRouteError(err);
  }
}
