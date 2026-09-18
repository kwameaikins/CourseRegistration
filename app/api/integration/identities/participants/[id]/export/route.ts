import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';

// GET /api/integration/identities/participants/[id]/export — what this app
// holds about one participant, for a subject-access export assembled by
// Knowsia Core (Coding Docs/22 §3, Phase 2) on an admin's audited request
// over there. Service key, never a browser. 404 when there is no such person.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    const { id } = await params;
    const data = await portalService.exportParticipantSystem(id);
    if (!data) {
      return errorResponse({ code: 'NOT_FOUND', message: 'Participant not found.' }, 404);
    }
    return successResponse(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
