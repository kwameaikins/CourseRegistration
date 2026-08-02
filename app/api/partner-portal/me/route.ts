import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { PARTNER_SESSION_COOKIE } from '@/modules/partners/types';

// GET /api/partner-portal/me — the partner dashboard payload for the
// current session.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
    const dashboard = await partnersService.getPartnerPortalDashboard(sessionId);
    return successResponse(dashboard);
  } catch (err) {
    return handleRouteError(err);
  }
}
