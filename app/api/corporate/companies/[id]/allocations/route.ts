import { handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const allocations = await corporateService.listAllocationsForCompany(id);
    return successResponse({ allocations });
  } catch (err) {
    return handleRouteError(err);
  }
}
