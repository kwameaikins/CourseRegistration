import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as paymentsService from '@/modules/payments/service';
import { paymentDiscountSchema } from '@/modules/payments/types';

// POST /api/payments/[id]/discount — [id] is the registrationId. Finance and
// admin can grant a partial discretionary discount; only admin may grant a
// discount that fully waives the remaining balance (enforced in the service
// layer, since it depends on the requested amount, not just the role).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: registrationId } = await params;
    const rawBody: unknown = await request.json();

    const parsed = paymentDiscountSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid discount data.',
        400,
      );
    }

    const result = await paymentsService.applyDiscount(registrationId, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
