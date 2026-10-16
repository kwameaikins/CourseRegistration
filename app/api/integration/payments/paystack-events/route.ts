import { z } from 'zod';

import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import * as paymentsRepository from '@/modules/payments/repository';

// GET /api/integration/payments/paystack-events?since=&until= — every
// Paystack payment this app applied in the window (its `payment_events`
// ledger), for Knowsia Core's weekly cross-check against its own ledger
// (2026-10-16). Read-only; references, registration ids and amounts only —
// no names, emails or phones. Window at most 35 days.
const query = z.object({ since: z.iso.datetime({ offset: true }), until: z.iso.datetime({ offset: true }) });

export async function GET(request: Request) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const params = new URL(request.url).searchParams;
    const parsed = query.safeParse({ since: params.get('since'), until: params.get('until') });
    if (!parsed.success) return errorResponse({ code: 'VALIDATION_ERROR', message: 'since and until must be ISO datetimes.' }, 400);
    const since = new Date(parsed.data.since);
    const until = new Date(parsed.data.until);
    if (!(until > since) || until.getTime() - since.getTime() > 35 * 86_400_000) {
      return errorResponse({ code: 'VALIDATION_ERROR', message: 'The window must be positive and at most 35 days.' }, 400);
    }
    const rows = await paymentsRepository.selectPaystackPaymentEventsSystem(since.toISOString(), until.toISOString());
    return successResponse({
      events: rows.map((r) => ({
        reference: r.transaction_id,
        registrationId: r.registration_id,
        amountMinor: Math.round(Number(r.amount) * 100),
        recordedAt: r.recorded_at,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
