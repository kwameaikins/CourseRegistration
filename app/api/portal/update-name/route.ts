import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE, portalUpdateNameSchema } from '@/modules/portal/types';

// POST /api/portal/update-name — requires a valid portal session cookie.
// Self-service name correction so a participant's certificate is issued
// with their correct name (founder request, 2026-07-24).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = portalUpdateNameSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid name.',
        400,
      );
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    await portalService.updateName(sessionId, parsed.data);

    return successResponse({ updated: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
