import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as knowsiaCoreService from '@/modules/knowsia-core/service';

// GET /api/integration/identities/export — called by knowsia-api's identity
// linker (Coding Docs/22 §3, Phase 2), never a browser. Every participant
// and staff account with the fields an identity is made of and any identity
// id already written. Same shared-secret trust boundary as certificates/issue.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    return successResponse(await knowsiaCoreService.exportPeopleForIdentityLink());
  } catch (err) {
    return handleRouteError(err);
  }
}
