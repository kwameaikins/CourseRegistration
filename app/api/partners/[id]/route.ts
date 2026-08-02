import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { updatePartnerInputSchema } from '@/modules/partners/types';

// PATCH /api/partners/[id] — edit contact/payout/commission-rate fields.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = updatePartnerInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid partner update.', 400);
    }
    const partner = await partnersService.updatePartner(id, parsed.data);
    return successResponse(partner);
  } catch (err) {
    return handleRouteError(err);
  }
}
