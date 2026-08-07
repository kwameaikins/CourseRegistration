import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as couponsService from '@/modules/coupons/service';
import { updateCouponInputSchema } from '@/modules/coupons/types';

// PATCH /api/coupons/[id] — admin + marketing. The code itself, its discount
// and its course scope are immutable once created: they are printed on
// campaign material and already recorded against past redemptions.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = updateCouponInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid coupon update.', 400);
    }
    const coupon = await couponsService.updateCoupon(id, parsed.data);
    return successResponse(coupon);
  } catch (err) {
    return handleRouteError(err);
  }
}
