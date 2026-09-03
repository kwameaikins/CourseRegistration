import { handleRouteError, successResponse } from '@/lib/errors';
import * as sequencesService from '@/modules/sequences/service';

// GET /api/sequences — nurture sequences with steps and enrollment counts
// (Revenue OS Phase 2, 2026-09-03). Role check in the service (admin+marketing).
export async function GET() {
  try {
    const sequences = await sequencesService.listSequences();
    return successResponse({ sequences });
  } catch (err) {
    return handleRouteError(err);
  }
}
