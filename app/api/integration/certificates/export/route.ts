import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';

// GET /api/integration/certificates/export — every certificate, for the LMS
// import (R3: the LMS becomes the only registry). Same service key as issue.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    return successResponse(await certificatesService.exportForLms());
  } catch (err) {
    return handleRouteError(err);
  }
}