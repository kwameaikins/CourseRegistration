import { AppError, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';

// GET /api/integration/certificates/next-number?code=CA01&date=2026-11-01 —
// the number the next issue would take. A pure read: nothing is inserted.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim() ?? '';
    const date = url.searchParams.get('date')?.trim() || new Date().toISOString().slice(0, 10);
    if (!/^[A-Za-z0-9]{2,10}$/.test(code) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('VALIDATION_ERROR', 'code and date (YYYY-MM-DD) are required.', 400);
    }
    const certificateNumber = await certificatesService.peekNextNumber(code, date);
    return successResponse({ certificateNumber });
  } catch (err) {
    return handleRouteError(err);
  }
}