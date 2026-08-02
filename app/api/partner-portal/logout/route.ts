import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { PARTNER_SESSION_COOKIE } from '@/modules/partners/types';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
    await partnersService.logoutOfPartnerPortal(sessionId);
    cookieStore.delete(PARTNER_SESSION_COOKIE);
    return successResponse({ loggedOut: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
