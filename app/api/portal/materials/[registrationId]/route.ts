import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/materials/[registrationId] — session-gated, the tutor-
// shared material links for this registration's batch (Tutor Portal Phase
// 4, founder-approved 2026-07-31).
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
    const materials = await portalService.getSessionMaterials(sessionId, registrationId);
    return successResponse(materials);
  } catch (err) {
    return handleRouteError(err);
  }
}
