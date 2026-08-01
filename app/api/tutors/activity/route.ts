import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';

// GET /api/tutors/activity — recent tutor-portal self-service actions
// (PIN changes, contact edits, attendance exceptions raised, materials
// added/removed). Admin/management gate lives in the service.
export async function GET() {
  try {
    const activity = await tutorsService.listTutorActivity();
    return successResponse({ activity });
  } catch (err) {
    return handleRouteError(err);
  }
}
