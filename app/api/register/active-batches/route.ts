import { handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';

// GET /api/register/active-batches — public, unauthenticated. The exact
// same active/future batch list already rendered server-side on /register
// (coursesService.getActiveBatchesForPublicForm) — exposed here so client
// components (the referral course-pickers in the student/tutor/partner
// portals, 2026-08-02) can fetch it without a server-side render. Safe to
// expose without auth: it's public course-catalogue data with no
// participant/PII content, already visible to any anonymous /register
// visitor.
export async function GET() {
  try {
    const batches = await coursesService.getActiveBatchesForPublicForm();
    return successResponse({ batches });
  } catch (err) {
    return handleRouteError(err);
  }
}
