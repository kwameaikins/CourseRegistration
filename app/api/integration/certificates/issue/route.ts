import { AppError, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';
import { externalIssueSchema } from '@/modules/certificates/types';

// POST /api/integration/certificates/issue — called by KnowsiaApp, never a
// browser (2026-09-17). When a student completes a self-paced course there,
// the certificate is issued HERE: the KNS-<CODE>-<YEAR>-<NNNN> serial is per
// course code per year in this registry, the codes are shared (CA01…), and a
// second issuer would mint the same number twice. Idempotent by externalRef
// (the caller's own certificate id) so a retry after a timeout returns the row
// it already created. Same shared-secret trust boundary as portal-login/verify.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = externalIssueSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'externalRef, courseCode, courseTitle, recipientName and hours are required.',
        400,
      );
    }
    const result = await certificatesService.issueForKnowsiaApp(parsed.data);
    return successResponse(result, result.existing ? 200 : 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
