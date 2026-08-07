import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as paymentsService from '@/modules/payments/service';

// POST /api/payments/[id]/coupon — finance/admin apply a coupon code to a
// registration on a student's behalf. [id] is the registration id, matching
// the sibling discount route.
//
// Unlike the free-form discount action, the amount is decided by the coupon's
// own terms, so this leaves an audit trail tying the reduction to a campaign
// and consumes the coupon's usage allowance.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { code?: unknown };
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (code.length < 3) {
      throw new AppError('VALIDATION_ERROR', 'Enter a valid discount code.', 400);
    }
    const result = await paymentsService.applyCouponAsStaff(id, code);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
