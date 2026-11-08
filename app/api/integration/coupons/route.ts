import { AppError, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as couponsService from '@/modules/coupons/service';
import { studyAppCouponInputSchema } from '@/modules/coupons/types';
import { z } from 'zod';

// GET  /api/integration/coupons?batchId=…  the coupons that apply to that batch's course.
// POST /api/integration/coupons             make one, tied to the batch's course and recorded under
//                                           a named staff member (the study app's cohort page).
// Authenticated like the other integration routes with KNOWSIA_APP_SERVICE_KEY.
function authorised(request: Request): boolean {
  const key = process.env.KNOWSIA_APP_SERVICE_KEY;
  return Boolean(key) && request.headers.get('authorization') === `Bearer ${key}`;
}

function requireBatchId(request: Request): string {
  const batchId = new URL(request.url).searchParams.get('batchId');
  if (!batchId) throw new AppError('VALIDATION_ERROR', 'batchId is required.', 400);
  if (!z.uuid().safeParse(batchId).success) {
    throw new AppError('VALIDATION_ERROR', 'batchId must be a UUID.', 400);
  }
  return batchId;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    return successResponse({ coupons: await couponsService.listCouponsForBatchSystem(requireBatchId(request)) });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    const raw: unknown = await request.json().catch(() => {
      throw new AppError('VALIDATION_ERROR', 'A coupon in JSON was expected.', 400);
    });
    const parsed = studyAppCouponInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid coupon.', 400);
    }
    return successResponse({ coupon: await couponsService.createCouponForStudyAppSystem(parsed.data) }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
