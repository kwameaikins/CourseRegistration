import { z } from 'zod';

import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import { balanceCheckout } from '@/lib/knowsia-core/balance-checkout';

// POST /api/checkout — a Paystack access code minted by Knowsia Core for this
// registration's BALANCE (Doc 25 §1, decision 3). The amount is read from
// this app's own payment row on the server, never from the browser: the old
// inline flow let the client name the amount, and this is what replaces it.
// `{ enabled: false }` when CORE_CHECKOUT is off or Core cannot answer, and
// the component falls back to the old flow — a student can always pay.
const schema = z.object({ registrationId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse({ code: 'VALIDATION_ERROR', message: 'registrationId is required.' }, 400);
    }
    const result = await balanceCheckout(parsed.data.registrationId);
    if (result.outcome === 'not_found') {
      return errorResponse({ code: 'NOT_FOUND', message: 'No payment record for this registration.' }, 404);
    }
    if (result.outcome === 'nothing_owed') {
      return errorResponse({ code: 'CONFLICT', message: 'Nothing is owed on this registration.' }, 409);
    }
    if (result.outcome === 'disabled') {
      return successResponse({ enabled: false });
    }
    const { checkout } = result;
    return successResponse({ enabled: true, accessCode: checkout.access_code, reference: checkout.reference, amountMinor: checkout.amount_minor });
  } catch (err) {
    return handleRouteError(err);
  }
}
