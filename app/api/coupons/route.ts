import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as couponsService from '@/modules/coupons/service';
import { createCouponInputSchema } from '@/modules/coupons/types';

// GET /api/coupons — admin, marketing and finance (finance applies them from
// the Payments screen, so they need to see what exists).
export async function GET() {
  try {
    const coupons = await couponsService.listCoupons();
    return successResponse({ coupons });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/coupons — admin + marketing, same roles that own partner codes.
export async function POST(request: Request) {
  try {
    const parsed = createCouponInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid coupon.',
        400,
      );
    }
    const coupon = await couponsService.createCoupon(parsed.data);
    return successResponse(coupon, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
