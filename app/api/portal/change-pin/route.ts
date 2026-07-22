import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE, portalChangePinSchema } from '@/modules/portal/types';

// POST /api/portal/change-pin — requires a valid portal session cookie.
// Used both for the forced first-login change and any later voluntary one.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = portalChangePinSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid PIN.',
        400,
      );
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    await portalService.changePin(sessionId, parsed.data);

    return successResponse({ changed: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
