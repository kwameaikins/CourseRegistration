import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as waitlistService from '@/modules/waitlist/service';

// GET /api/waitlist?batchId=... — staff read (Document 3/waitlist RLS:
// admin full, finance/marketing/management read-only; role gate lives in
// waitlistService.getWaitlistForBatch).
export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) {
      throw new AppError('VALIDATION_ERROR', 'batchId is required.', 400);
    }
    const entries = await waitlistService.getWaitlistForBatch(batchId);
    return successResponse({ entries });
  } catch (err) {
    return handleRouteError(err);
  }
}
