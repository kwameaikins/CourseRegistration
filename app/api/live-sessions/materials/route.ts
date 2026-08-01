import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as liveSessionsService from '@/modules/live-sessions/service';

// GET /api/live-sessions/materials?batchId=... — staff read-only view of
// tutor-shared material links. Admin/management gate lives in the service
// (matches the /live-sessions screen's role gate).
export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) {
      throw new AppError('VALIDATION_ERROR', 'batchId is required.', 400);
    }
    const materials = await liveSessionsService.getSessionMaterialsForBatch(batchId);
    return successResponse({ materials });
  } catch (err) {
    return handleRouteError(err);
  }
}
