import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as feedbackService from '@/modules/feedback/service';
import * as usersService from '@/modules/users/service';

// GET /api/feedback-summary?batchId=... — per-Batch feedback aggregates and
// rows. Admin + Management, matching the feedback RLS read policy.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'management']);
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) {
      throw new AppError('VALIDATION_ERROR', 'batchId is required.', 400);
    }
    const summary = await feedbackService.getBatchFeedbackSummary(batchId);
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
