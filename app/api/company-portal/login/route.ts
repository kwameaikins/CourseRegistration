import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { COMPANY_PORTAL_SESSION_COOKIE, companyPortalLoginSchema } from '@/modules/corporate/types';

// POST /api/company-portal/login — public. Billing email + 4-digit PIN.
// Every failure branch maps to a response that never reveals which part
// was wrong, except lockout (mirrors app/api/portal/login/route.ts).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = companyPortalLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Enter your billing email and your 4-digit PIN.', 400);
    }

    const result = await corporateService.loginToCompanyPortal(parsed.data);

    if (result.status === 'locked') {
      throw new AppError('LOCKED', 'Too many incorrect attempts. Please try again in 15 minutes.', 429);
    }
    if (result.status === 'invalid') {
      throw new AppError('INVALID_LOGIN', 'Incorrect login details.', 401);
    }

    const cookieStore = await cookies();
    cookieStore.set(COMPANY_PORTAL_SESSION_COOKIE, result.sessionId, {
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
