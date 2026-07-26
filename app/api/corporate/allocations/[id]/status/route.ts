import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { updateAllocationStatusInputSchema } from '@/modules/corporate/types';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = updateAllocationStatusInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'A status and reason (3-500 chars) are required.', 400);
    }
    const allocation = await corporateService.updateSeatAllocationStatus(id, parsed.data);
    return successResponse(allocation);
  } catch (err) {
    return handleRouteError(err);
  }
}
