import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { COMPANY_PORTAL_SESSION_COOKIE } from '@/modules/corporate/types';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COMPANY_PORTAL_SESSION_COOKIE)?.value;
    await corporateService.logoutOfCompanyPortal(sessionId);
    cookieStore.delete(COMPANY_PORTAL_SESSION_COOKIE);
    return successResponse({ loggedOut: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
