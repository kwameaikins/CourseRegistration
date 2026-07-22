import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// POST /api/portal/logout — revokes the session and clears the cookie.
export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    await portalService.logout(sessionId);
    cookieStore.delete(PORTAL_SESSION_COOKIE);
    return successResponse({ loggedOut: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
