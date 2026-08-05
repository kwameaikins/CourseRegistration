import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as liveSessionsService from '@/modules/live-sessions/service';

// DELETE /api/live-sessions/materials/[id] — admin removes any learning
// resource on any batch, including one a tutor added. The R2 object is
// deliberately left in place (private bucket, negligible cost at this scale)
// — see removeSessionMaterialAsStaff.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    await liveSessionsService.removeSessionMaterialAsStaff(id);
    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
