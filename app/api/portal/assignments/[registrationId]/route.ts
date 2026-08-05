import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/assignments/[registrationId] — session-gated. Every
// assignment set on this registration's batch, each carrying only this
// learner's own submission (Document 14 §6: a Student cannot view another
// learner's work).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const assignments = await portalService.getAssignments(sessionId, registrationId);
    return successResponse(assignments);
  } catch (err) {
    return handleRouteError(err);
  }
}
