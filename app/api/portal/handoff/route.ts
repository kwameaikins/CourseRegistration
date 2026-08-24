import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// POST /api/portal/handoff — session-gated. Mints a 60-second single-use token
// and returns the KnowsiaApp URL to send the browser to. Seam I of platform
// convergence (Coding Docs/19_Platform_Convergence.md §4).
//
// POST rather than GET because it writes (mints a token) — and because a GET
// would be prefetchable, which would burn single-use tokens on link hover.
//
// There is no participant parameter, by design: who the handoff is for comes
// from the session cookie alone, so this endpoint cannot be pointed at anyone
// else. Same rule as POST /api/portal/enrol.
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    // Optional {next} destination for deep-linking into a specific course;
    // absent/invalid bodies keep the default landing.
    let next: string | undefined;
    try {
      const body = (await request.json()) as { next?: unknown };
      if (typeof body?.next === 'string') next = body.next;
    } catch {
      // no body — fine
    }
    const handoff = await portalService.issueKnowsiaAppHandoff(sessionId, next);
    return successResponse({ url: handoff.url, expiresAt: handoff.expiresAt });
  } catch (err) {
    return handleRouteError(err);
  }
}
