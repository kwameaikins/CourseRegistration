import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { knowsiaAppRedeemHandoffSchema } from '@/modules/portal/types';

// POST /api/integration/handoff/verify — called by KnowsiaApp, never a browser.
// Seam I of platform convergence (Coding Docs/19_Platform_Convergence.md §4).
//
// Shared-secret trust boundary, the same inline Bearer check every cron route
// uses, and the same shape as KnowsiaApp's own X-Service-Key convention. This
// is the whole security argument for an opaque token over a self-contained JWT:
// the token travels in a URL query string and will land in KnowsiaApp's logs
// and the student's browser history, but redeeming it ALSO requires this key —
// so an intercepted token on its own is worth nothing.
//
// Returns identity only, never entitlement (BR-45). What a linked user may
// study is Seam III's question.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }

  try {
    const body = await request.json();
    const { token } = knowsiaAppRedeemHandoffSchema.parse(body);
    const identity = await portalService.redeemKnowsiaAppHandoff(token);
    return successResponse(identity);
  } catch (err) {
    return handleRouteError(err);
  }
}
