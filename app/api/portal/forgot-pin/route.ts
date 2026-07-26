import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { portalForgotPinSchema } from '@/modules/portal/types';

// POST /api/portal/forgot-pin — public. Always returns the same generic
// success regardless of whether the identifier matched an account — no
// enumeration, same posture as login's failure branches.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = portalForgotPinSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Enter your email or mobile number.',
        400,
      );
    }

    await portalService.requestPinReset(parsed.data);
    return successResponse({ sent: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
