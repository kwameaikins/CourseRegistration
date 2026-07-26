import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { createCompanyInputSchema } from '@/modules/corporate/types';

export async function GET() {
  try {
    const companies = await corporateService.listCompanies();
    return successResponse({ companies });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createCompanyInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid company payload.', 400);
    }
    const company = await corporateService.createCompany(parsed.data);
    return successResponse(company, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
