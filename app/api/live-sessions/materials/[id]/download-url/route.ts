import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as liveSessionsService from '@/modules/live-sessions/service';

// GET /api/live-sessions/materials/[id]/download-url — short-lived (5 min)
// presigned R2 URL for a file-backed learning resource. Admin/management,
// gated in the service; file bytes never pass through our own server.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const url = await liveSessionsService.getSessionMaterialDownloadUrlAsStaff(id);
    return successResponse({ url });
  } catch (err) {
    return handleRouteError(err);
  }
}
