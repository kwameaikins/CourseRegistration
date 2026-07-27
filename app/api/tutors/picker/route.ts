import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';

// GET /api/tutors/picker — lightweight name/email/phone list for the
// facilitator picker on Courses/Live Sessions. Ungated by role (any staff
// reaching those screens can already see tutor names to coordinate
// classes) — the full /api/tutors list (with batch counts) stays
// admin/management only.
export async function GET() {
  try {
    const tutors = await tutorsService.listTutorsForPicker();
    return successResponse({ tutors });
  } catch (err) {
    return handleRouteError(err);
  }
}
