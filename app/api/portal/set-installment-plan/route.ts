import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE, portalSetUpInstallmentPlanSchema } from '@/modules/portal/types';

// POST /api/portal/set-installment-plan — requires a valid portal session
// cookie. Simple fixed-split payment plan (founder-approved 2026-07-24).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = portalSetUpInstallmentPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid request.',
        400,
      );
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    await portalService.setUpInstallmentPlan(sessionId, parsed.data);

    return successResponse({ created: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
