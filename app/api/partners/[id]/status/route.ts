import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';

// POST /api/partners/[id]/status — suspend or reactivate an already-active
// partner (distinct from /review, which only ever applies to a pending
// application).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: unknown };
    if (body.status !== 'suspended' && body.status !== 'active') {
      throw new AppError('VALIDATION_ERROR', 'status must be "suspended" or "active".', 400);
    }
    const partner =
      body.status === 'suspended'
        ? await partnersService.suspendPartner(id)
        : await partnersService.reactivatePartner(id);
    return successResponse(partner);
  } catch (err) {
    return handleRouteError(err);
  }
}
