import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE, portalLoginSchema } from '@/modules/portal/types';

// POST /api/portal/login — public. Identifier is email or phone, PIN is
// 4 digits. Every failure branch (bad identifier, wrong PIN, locked) maps
// to a response that never reveals which part was wrong, except lockout
// (students need to know to wait).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = portalLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Enter your email or mobile number and your 4-digit PIN.',
        400,
      );
    }

    const result = await portalService.login(parsed.data);

    if (result.status === 'locked') {
      throw new AppError(
        'LOCKED',
        'Too many incorrect attempts. Please try again in 15 minutes.',
        429,
      );
    }
    if (result.status === 'invalid') {
      throw new AppError('INVALID_LOGIN', 'Incorrect login details.', 401);
    }

    const cookieStore = await cookies();
    cookieStore.set(PORTAL_SESSION_COOKIE, result.sessionId, {
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
