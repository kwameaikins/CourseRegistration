import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { knowsiaAppLinkSchema } from '@/modules/portal/types';

// POST /api/integration/handoff/link — called by KnowsiaApp once it has
// found-or-created its own user for a redeemed identity, to record the link on
// this side. Seam I of platform convergence.
//
// Separate from /verify on purpose: verify consumes a single-use token and must
// succeed exactly once, whereas linking is idempotent and safely retryable. If
// KnowsiaApp creates its user but the link call fails, it can retry the link
// without needing a fresh handoff.
//
// Each system stores its own copy of the link and neither reads the other's
// database — Rule 2 there, the module boundary rule here.
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
    const input = knowsiaAppLinkSchema.parse(body);
    await portalService.linkKnowsiaAppUser(input);
    return successResponse({ linked: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
