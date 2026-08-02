import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';

// POST /api/partners/[id]/review — approve or reject a pending application
// (mirrors app/api/payment-submissions/[id]/review's one-route-two-decisions
// shape). Approving seeds partner_auth from the last 4 digits of phone
// (skipped for tutor-category, which can never reach this route since
// tutors are always staff-created, never applicants).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { decision?: unknown };
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new AppError('VALIDATION_ERROR', 'decision must be "approve" or "reject".', 400);
    }
    const partner =
      body.decision === 'approve'
        ? await partnersService.approvePartnerApplication(id)
        : await partnersService.rejectPartnerApplication(id);
    return successResponse(partner);
  } catch (err) {
    return handleRouteError(err);
  }
}
