import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import * as usersService from '@/modules/users/service';

// POST /api/portal/admin/backfill-pins — admin only, one-off (idempotent,
// safe to re-run). Seeds a participant_auth row (PIN = last 4 digits of
// phone) for every existing participant who registered before the portal
// existed.
export async function POST() {
  try {
    await usersService.requireRole(['admin']);
    const result = await portalService.backfillParticipantAuth();
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
