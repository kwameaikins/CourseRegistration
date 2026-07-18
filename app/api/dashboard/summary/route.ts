import { handleRouteError, successResponse } from '@/lib/errors';
import * as dashboardService from '@/modules/dashboard/service';

// GET /api/dashboard/summary — F1.08, admin/management only. All figures are
// computed live on every request (Document 5, Section 10).
export async function GET() {
  try {
    const summary = await dashboardService.getDashboardSummary();
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
