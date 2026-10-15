import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import * as portalService from '@/modules/portal/service';

// GET /api/integration/participants/[id]/materials/[registrationId]
//   → the materials list for that registration's cohort.
// GET …?materialId=<uuid>
//   → { url } — a presigned link for one file-backed material, authorized
//     against this participant's own cohort before anything is signed.
// Called by KnowsiaApp for its signed-in student (one-portal merge, 2026-10-15).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> },
) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const { id, registrationId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }
    const materialId = new URL(request.url).searchParams.get('materialId');
    if (materialId !== null) {
      if (!z.uuid().safeParse(materialId).success) {
        throw new AppError('VALIDATION_ERROR', 'A valid materialId is required.', 400);
      }
      const url = await portalService.getMaterialDownloadUrlForParticipant(id, registrationId, materialId);
      return successResponse({ url });
    }
    return successResponse(await portalService.getSessionMaterialsForParticipant(id, registrationId));
  } catch (err) {
    return handleRouteError(err);
  }
}
