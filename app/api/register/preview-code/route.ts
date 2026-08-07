import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import * as couponsService from '@/modules/coupons/service';

// POST /api/register/preview-code — public, live coupon/referral-code
// preview for the registration form (Knowsia Growth Partner Programme,
// 2026-08-02). Read-only — never records a redemption; that only happens
// when the registration itself is submitted.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const { code, batchId } = (body ?? {}) as { code?: unknown; batchId?: unknown };
    if (typeof code !== 'string' || typeof batchId !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'code and batchId are required.', 400);
    }

    // Partner code first, then standalone coupon — the form has one field and
    // students are not expected to know which kind they hold. Mirrors the
    // resolution order in registrationsService.createRegistration.
    const preview = await partnersService.previewCode(code, batchId);
    if (preview.valid) {
      return successResponse(preview);
    }

    const coupon = await couponsService.previewCoupon(code, batchId);
    if (coupon.valid) {
      return successResponse({
        valid: true,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        partnerId: null,
      });
    }

    // Neither matched — return the partner-code message, which is the generic
    // "not valid" unless the code was recognised and rejected for a specific
    // reason worth showing.
    return successResponse(preview);
  } catch (err) {
    return handleRouteError(err);
  }
}
