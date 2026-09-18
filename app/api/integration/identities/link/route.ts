import { AppError, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as knowsiaCoreService from '@/modules/knowsia-core/service';

// POST /api/integration/identities/link — knowsia-api's linker writes the
// Core identity id onto participants and staff (Coding Docs/22 §3, Phase 2).
// A row already carrying a different identity is skipped and counted, never
// moved: a conflict is the linker's plan to report and a person's to settle.
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
    const parsed = knowsiaCoreService.identityLinkSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'participants and staff must be lists of {id, coreIdentityId}.', 400);
    }
    return successResponse(await knowsiaCoreService.applyIdentityLinks(parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}
