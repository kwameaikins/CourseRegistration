import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { PARTNER_SESSION_COOKIE, partnerPortalLoginSchema } from '@/modules/partners/types';

// POST /api/partner-portal/login — public. Phone + 4-digit PIN. Every
// failure branch maps to a response that never reveals which part was
// wrong, except lockout (mirrors app/api/company-portal/login/route.ts).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = partnerPortalLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Enter your phone number and your 4-digit PIN.', 400);
    }

    const result = await partnersService.loginToPartnerPortal(parsed.data);

    if (result.status === 'locked') {
      throw new AppError('LOCKED', 'Too many incorrect attempts. Please try again in 15 minutes.', 429);
    }
    if (result.status === 'invalid') {
      throw new AppError('INVALID_LOGIN', 'Incorrect login details.', 401);
    }

    const cookieStore = await cookies();
    cookieStore.set(PARTNER_SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: new Date(result.expiresAt),
    });

    return successResponse({ mustChangePin: result.mustChangePin });
  } catch (err) {
    return handleRouteError(err);
  }
}
