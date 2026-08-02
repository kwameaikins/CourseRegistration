import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { recordPayoutInputSchema } from '@/modules/partners/types';

// POST /api/commissions/payout — records one payout covering a set of
// payable commissions (all for the same partner), moving them to paid.
export async function POST(request: Request) {
  try {
    const parsed = recordPayoutInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid payout details.',
        400,
      );
    }
    const payout = await partnersService.recordPayout(parsed.data);
    return successResponse(payout, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
