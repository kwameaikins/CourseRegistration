import { handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';

// GET /api/participants — admin only; backs the Participant Data Deletion
// panel (DPA-02). RLS additionally restricts participant rows to Admin.
export async function GET() {
  try {
    const participants = await registrationsService.listParticipantsForDeletionScreen();
    return successResponse({ participants });
  } catch (err) {
    return handleRouteError(err);
  }
}
