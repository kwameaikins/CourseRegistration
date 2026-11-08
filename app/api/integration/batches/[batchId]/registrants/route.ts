import { AppError, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import { shapeBatchRegistrants } from '@/modules/registrations/batch-registrants';
import * as registrationsRepository from '@/modules/registrations/repository';
import { z } from 'zod';

// GET /api/integration/batches/{batchId}/registrants — everyone registered on a batch with
// their payment standing, for the study app's cohort page (paid, part paid and not yet paid).
// A pure read, authenticated like the other integration routes with KNOWSIA_APP_SERVICE_KEY.
// An unknown batch 404s rather than reading as an empty one, so the study app can tell
// "nobody has registered yet" from "this batch is gone".
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    const { batchId } = await context.params;
    if (!z.uuid().safeParse(batchId).success) {
      throw new AppError('VALIDATION_ERROR', 'batchId must be a UUID.', 400);
    }
    const batch = await coursesService.getBatchByIdSystem(batchId);
    if (!batch) throw new AppError('NOT_FOUND', 'Batch not found.', 404);
    const rows = await registrationsRepository.selectBatchRegistrantsSystem(batchId);
    return successResponse({ batchId, registrants: shapeBatchRegistrants(rows) });
  } catch (err) {
    return handleRouteError(err);
  }
}
