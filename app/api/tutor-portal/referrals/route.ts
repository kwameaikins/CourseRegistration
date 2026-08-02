import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

// GET /api/tutor-portal/referrals — a tutor's own referral summary
// (Knowsia Growth Partner Programme, 2026-08-02). Returns null if this
// tutor has no linked partners row.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const summary = await tutorsService.getReferralSummaryForSession(sessionId);
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
