import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/referrals — a student's own referral summary, if they've
// become an Ambassador partner (null otherwise; see
// POST /api/portal/become-ambassador).
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const summary = await portalService.getReferralSummaryForSession(sessionId);
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
