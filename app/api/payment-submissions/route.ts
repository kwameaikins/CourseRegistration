import { handleRouteError, successResponse } from '@/lib/errors';
import * as paymentsService from '@/modules/payments/service';

// GET /api/payment-submissions?status=pending — the staff review queue.
// Finance/admin only (paymentsService.listPaymentSubmissions gates it).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    let filters: { status: 'pending' | 'approved' | 'rejected' } | undefined;
    if (status === 'pending' || status === 'approved' || status === 'rejected') {
      filters = { status };
    }
    const submissions = await paymentsService.listPaymentSubmissions(filters);
    return successResponse({ submissions });
  } catch (err) {
    return handleRouteError(err);
  }
}
