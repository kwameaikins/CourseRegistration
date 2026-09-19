import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as liveSessionsService from '@/modules/live-sessions/service';
import { setMaterialScopeSchema } from '@/modules/live-sessions/types';

// PATCH /api/live-sessions/materials/[id] — admin moves a resource into the
// course library ({ scope: 'course' }) so every cohort sees it, or back to
// one cohort ({ scope: 'cohort', batchId }).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const parsed = setMaterialScopeSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid scope.', 400);
    }
    const material = await liveSessionsService.setSessionMaterialScopeAsStaff(id, parsed.data.scope, parsed.data.batchId);
    return successResponse(material);
  } catch (err) {
    return handleRouteError(err);
  }
}

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
