import { z } from 'zod';

import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import * as portalService from '@/modules/portal/service';

// POST /api/integration/participants/[id]/installment-plan/[registrationId] —
// the portal's 50/50 payment plan, for KnowsiaApp's signed-in student
// (one-portal merge Phase 3b, 2026-10-15). Same rules as the portal: only
// before any payment, once, and not when the course starts too soon.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> },
) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const { id, registrationId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(registrationId).success) {
      return errorResponse({ code: 'NOT_FOUND', message: 'Not found.' }, 404);
    }
    await portalService.setUpInstallmentPlanForParticipant(id, { registrationId });
    return successResponse({ created: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
