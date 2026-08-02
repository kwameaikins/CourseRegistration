import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';

// POST /api/commissions/mark-payable — the manual finance-review checkpoint
// (doc: "Finance reviews commissions during the first five working days").
// Only ever moves approved -> payable; the service rejects anything else.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { commissionIds?: unknown };
    if (!Array.isArray(body.commissionIds) || body.commissionIds.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'commissionIds must be a non-empty array.', 400);
    }
    await partnersService.markCommissionsPayable(body.commissionIds as string[]);
    return successResponse({ updated: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
