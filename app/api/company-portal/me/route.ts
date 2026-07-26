import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { COMPANY_PORTAL_SESSION_COOKIE } from '@/modules/corporate/types';

// GET /api/company-portal/me — the company dashboard payload for the
// current session.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COMPANY_PORTAL_SESSION_COOKIE)?.value;
    const dashboard = await corporateService.getCompanyPortalDashboard(sessionId);
    return successResponse(dashboard);
  } catch (err) {
    return handleRouteError(err);
  }
}
