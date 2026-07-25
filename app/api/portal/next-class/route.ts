import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';
import { selectNextClassForParticipant } from '@/modules/live-sessions/portal-access';

// GET /api/portal/next-class — the student portal's "Next Class" card
// (Document 14, Section 8). Requires a valid portal session cookie.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const { participantId } = await portalService.requirePortalSession(sessionId);
    const nextClass = await selectNextClassForParticipant(participantId);
    return successResponse({ nextClass });
  } catch (err) {
    return handleRouteError(err);
  }
}
