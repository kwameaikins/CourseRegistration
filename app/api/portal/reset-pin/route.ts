import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { portalResetPinSchema } from '@/modules/portal/types';

// POST /api/portal/reset-pin — public, gated by the single-use token itself
// rather than a session cookie (the participant isn't logged in yet).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = portalResetPinSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid request.',
        400,
      );
    }

    await portalService.resetPin(parsed.data);
    return successResponse({ reset: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
