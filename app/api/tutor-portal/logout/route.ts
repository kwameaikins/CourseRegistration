import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    await tutorsService.logoutOfTutorPortal(sessionId);
    cookieStore.delete(TUTOR_PORTAL_SESSION_COOKIE);
    return successResponse({ loggedOut: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
