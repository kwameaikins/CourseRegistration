import { AppError, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { portalLoginSchema } from '@/modules/portal/types';

// POST /api/integration/portal-login/verify — called by KnowsiaApp, never a
// browser. A cohort student signing into the study platform with their
// existing email/phone + PIN (founder direction 2026-08-23): this verifies
// the credentials with EXACTLY the portal's own logic — same lockout
// counter, same no-enumeration 'invalid' — and returns identity only, never
// entitlement (BR-45). Same shared-secret trust boundary as the handoff
// verify route.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = portalLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'identifier and 4-digit pin are required.', 400);
    }

    const result = await portalService.verifyCredentialsForKnowsiaApp(parsed.data);
    if (result.status === 'locked') {
      throw new AppError('LOCKED', 'Too many incorrect attempts. Try again in 15 minutes.', 429);
    }
    if (result.status === 'invalid') {
      throw new AppError('INVALID_LOGIN', 'Incorrect login details.', 401);
    }
    return successResponse(result.identity);
  } catch (err) {
    return handleRouteError(err);
  }
}
