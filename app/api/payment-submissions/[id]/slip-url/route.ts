import { handleRouteError, successResponse } from '@/lib/errors';
import * as paymentsService from '@/modules/payments/service';

// GET /api/payment-submissions/[id]/slip-url — a short-lived (5 min)
// presigned R2 URL so staff can view the uploaded slip directly; the file
// bytes never pass through our own server. Finance/admin only.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = await paymentsService.getPaymentSubmissionSlipUrl(id);
    return successResponse({ url });
  } catch (err) {
    return handleRouteError(err);
  }
}
