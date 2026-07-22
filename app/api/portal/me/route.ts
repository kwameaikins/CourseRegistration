import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/me — the student dashboard payload for the current session.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const dashboard = await portalService.getPortalDashboard(sessionId);
    return successResponse(dashboard);
  } catch (err) {
    return handleRouteError(err);
  }
}
