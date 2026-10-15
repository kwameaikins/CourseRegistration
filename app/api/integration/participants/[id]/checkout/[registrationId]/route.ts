import { z } from 'zod';

import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import { allowedCallback, balanceCheckout } from '@/lib/knowsia-core/balance-checkout';

// POST /api/integration/participants/[id]/checkout/[registrationId] — a Core
// checkout for what this participant still owes on this registration, for
// KnowsiaApp's Pay button (one-portal merge Phase 3a, 2026-10-15). Same money
// path as the portal's own Pay: the balance is this app's payment row, the
// webhook comes to Core and is forwarded to /api/webhooks/paystack here, so the
// payment is applied exactly as a portal payment is. The student is sent back
// to `callbackUrl`, which must be on knowsia.com — never an open redirect.
// `part: 'installment'` (Phase 3b): just the next instalment of a payment plan.
const body = z.object({ callbackUrl: z.string().url().max(500).nullish(), part: z.enum(['balance', 'installment']).optional() });

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
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success || !allowedCallback(parsed.data.callbackUrl)) {
      return errorResponse({ code: 'VALIDATION_ERROR', message: 'callbackUrl must be a knowsia.com address.' }, 400);
    }
    const result = await balanceCheckout(registrationId, { participantId: id, callbackUrl: parsed.data.callbackUrl ?? null, part: parsed.data.part });
    if (result.outcome === 'not_found') return errorResponse({ code: 'NOT_FOUND', message: 'Not found.' }, 404);
    if (result.outcome === 'nothing_owed') return errorResponse({ code: 'CONFLICT', message: 'Nothing is owed on this registration.' }, 409);
    if (result.outcome === 'disabled') return errorResponse({ code: 'UNAVAILABLE', message: 'Online payment is not available right now.' }, 503);
    const { checkout } = result;
    return successResponse({
      authorizationUrl: checkout.authorization_url,
      reference: checkout.reference,
      amountMinor: checkout.amount_minor,
      currency: checkout.currency,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
