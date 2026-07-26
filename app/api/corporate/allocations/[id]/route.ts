import { handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const allocation = await corporateService.getAllocationById(id);
    return successResponse(allocation);
  } catch (err) {
    return handleRouteError(err);
  }
}
