import { z } from 'zod';

import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import { batchSkuCode } from '@/lib/knowsia-core/catalogue';
import { createCheckoutOnCore, isCoreCheckoutOn } from '@/lib/knowsia-core/payments';
import * as knowsiaAppRepository from '@/modules/knowsia-app/repository';
import * as paymentsRepository from '@/modules/payments/repository';

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
    if (!isCoreCheckoutOn()) {
      return successResponse({ enabled: false });
    }
    const { registrationId } = parsed.data;
    const [payment, context] = await Promise.all([
      paymentsRepository.selectPaymentByRegistrationIdSystem(registrationId),
      knowsiaAppRepository.selectPaymentSettledContextSystem(registrationId),
    ]);
    if (!payment || !context || context.participantDeleted) {
      return errorResponse({ code: 'NOT_FOUND', message: 'No payment record for this registration.' }, 404);
    }
    const balanceMinor = Math.round(Number(payment.balance) * 100);
    if (balanceMinor <= 0) {
      return errorResponse({ code: 'CONFLICT', message: 'Nothing is owed on this registration.' }, 409);
    }
    const checkout = await createCheckoutOnCore({
      registrationId,
      participantId: context.participantId,
      participantEmail: context.participantEmail,
      skuCode: batchSkuCode(context.courseCode, context.cohortLabel),
      balanceMinor,
      isBalance: Number(payment.amount_paid) > 0 || Math.round(Number(payment.course_fee) * 100) !== balanceMinor,
    });
    if (!checkout) {
      return successResponse({ enabled: false });
    }
    return successResponse({ enabled: true, accessCode: checkout.access_code, reference: checkout.reference, amountMinor: checkout.amount_minor });
  } catch (err) {
    return handleRouteError(err);
  }
}
