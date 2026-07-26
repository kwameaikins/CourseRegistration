import { handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const company = await corporateService.getCompanyById(id);
    return successResponse(company);
  } catch (err) {
    return handleRouteError(err);
  }
}
