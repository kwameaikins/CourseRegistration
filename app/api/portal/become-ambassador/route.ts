import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// POST /api/portal/become-ambassador — "Refer & Earn" self-serve signup
// (founder-approved 2026-08-02). Auto-approved, no staff review — idempotent,
// safe to call again for a student who's already a partner.
export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const partner = await portalService.becomeAmbassadorPartner(sessionId);
    return successResponse(partner, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
