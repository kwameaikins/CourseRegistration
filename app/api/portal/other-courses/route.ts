import { cookies } from 'next/headers';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/other-courses — session-gated (kept inside the portal's
// own surface even though the underlying batch data is public), active
// batches this participant isn't already registered in.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const batches = await portalService.getOtherCourses(sessionId);
    return successResponse(batches);
  } catch (err) {
    return handleRouteError(err);
  }
}
