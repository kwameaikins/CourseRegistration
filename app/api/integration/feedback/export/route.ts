import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as feedbackService from '@/modules/feedback/service';

// GET /api/integration/feedback/export - every feedback row, for the LMS
// import (feedback moves to the LMS). Same service key as the certificates export.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    return successResponse(await feedbackService.exportFeedbackForLms());
  } catch (err) {
    return handleRouteError(err);
  }
}
