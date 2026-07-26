import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { createSeatAllocationInputSchema } from '@/modules/corporate/types';

export async function POST(request: Request) {
  try {
    const parsed = createSeatAllocationInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid seat allocation payload.', 400);
    }
    const allocation = await corporateService.createSeatAllocation(parsed.data);
    return successResponse(allocation, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
