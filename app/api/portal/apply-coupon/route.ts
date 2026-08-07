import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';
import { applyCouponInputSchema } from '@/modules/coupons/types';

// POST /api/portal/apply-coupon — a student applies a standalone coupon code
// to one of their own registrations, reducing the balance before they pay.
// Ownership of the registration is checked in the service against this
// session's own dashboard data.
export async function POST(request: Request) {
  try {
    const parsed = applyCouponInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Enter a valid discount code.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const result = await portalService.applyCouponForSession(sessionId, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
