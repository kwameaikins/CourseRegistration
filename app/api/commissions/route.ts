import { handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';

// GET /api/commissions?status=&partnerId= — finance/admin queue, joined
// with partner/participant/course context for display.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const partnerId = searchParams.get('partnerId') ?? undefined;
    const commissions = await partnersService.listCommissions({ status, partnerId });
    return successResponse({ commissions });
  } catch (err) {
    return handleRouteError(err);
  }
}
