import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';
import { redeemCommissionCreditInputSchema } from '@/modules/partners/types';

// POST /api/portal/redeem-credit — a student-ambassador spends their own
// 'payable' commission balance as course-fee credit, toward their own
// registration or a referred student's.
export async function POST(request: Request) {
  try {
    const parsed = redeemCommissionCreditInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid redemption request.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const result = await portalService.redeemCommissionCreditForSession(sessionId, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
