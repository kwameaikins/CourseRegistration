import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';

// POST /api/tutors/backfill-partners — admin only, one-off (idempotent,
// safe to re-run). Provisions a partner record + referral code for every
// existing tutor who doesn't already have one (2026-08-02).
export async function POST() {
  try {
    const result = await tutorsService.backfillTutorPartners();
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
