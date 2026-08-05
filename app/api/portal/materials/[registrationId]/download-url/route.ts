import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/materials/[registrationId]/download-url?materialId=... —
// session-gated presigned R2 URL for a file-backed learning resource. The
// service checks both that the registration belongs to this session AND that
// the material belongs to that registration's own batch, so a material id
// from another cohort reads as 404 rather than as a download.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }
    const materialId = new URL(request.url).searchParams.get('materialId');
    if (!materialId || !z.uuid().safeParse(materialId).success) {
      throw new AppError('VALIDATION_ERROR', 'A valid materialId is required.', 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const url = await portalService.getMaterialDownloadUrl(sessionId, registrationId, materialId);
    return successResponse({ url });
  } catch (err) {
    return handleRouteError(err);
  }
}
