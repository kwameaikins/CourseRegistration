import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE, exchangeLoginTokenSchema } from '@/modules/portal/types';

// POST /api/portal/exchange-login-token — public. The Paystack checkout
// reference the browser generated proves it owns the just-completed
// payment; the webhook (server-side, no browser) mints the actual login
// token once that payment flips to Paid. This endpoint is what turns the
// two into a real portal session cookie, so the participant lands straight
// in their dashboard after paying — no PIN step (founder-approved
// 2026-07-22). Both 'pending' (webhook not processed yet) and 'invalid'
// (no live token — e.g. already redeemed) are normal outcomes, not errors:
// the client just keeps showing its existing "payment received" message and
// the participant can always fall back to /portal/login.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = exchangeLoginTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'A payment reference is required.', 400);
    }

    const result = await portalService.exchangeLoginToken(parsed.data.reference);
    if (result.status !== 'ok') {
      return successResponse({ status: result.status });
    }

    const cookieStore = await cookies();
    cookieStore.set(PORTAL_SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: new Date(result.expiresAt),
    });

    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
