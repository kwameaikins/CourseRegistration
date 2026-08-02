import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';
import { redeemCommissionCreditInputSchema } from '@/modules/partners/types';

// POST /api/tutor-portal/redeem-credit — a Tutor Partner spends their own
// 'payable' commission balance as course-fee credit, toward a referred
// student's registration (or their own, if they're ever also a customer).
export async function POST(request: Request) {
  try {
    const parsed = redeemCommissionCreditInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid redemption request.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const result = await tutorsService.redeemCommissionCreditForSession(sessionId, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
