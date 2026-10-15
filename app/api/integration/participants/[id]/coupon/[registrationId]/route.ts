import { z } from 'zod';

import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import { applyCouponInputSchema } from '@/modules/coupons/types';
import * as portalService from '@/modules/portal/service';

// POST /api/integration/participants/[id]/coupon/[registrationId] — the
// portal's "apply a discount code", for KnowsiaApp's signed-in student
// (one-portal merge Phase 3b, 2026-10-15). Same function as the portal's: the
// registration must be this participant's, a written-off one is refused, and
// rejected codes count against the same per-participant throttle.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> },
) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const { id, registrationId } = await params;
    if (!z.uuid().safeParse(id).success) return errorResponse({ code: 'NOT_FOUND', message: 'Not found.' }, 404);
    const raw = (await request.json().catch(() => ({}))) as { code?: unknown };
    const parsed = applyCouponInputSchema.safeParse({ registrationId, code: raw.code });
    if (!parsed.success) return errorResponse({ code: 'VALIDATION_ERROR', message: 'Enter a valid discount code.' }, 400);
    const result = await portalService.applyCouponForParticipant(id, parsed.data);
    return successResponse({ discountApplied: result.discountApplied, couponCode: result.couponCode });
  } catch (err) {
    return handleRouteError(err);
  }
}
