import { parseDateRange } from '@/lib/date-range';
import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as opportunitiesService from '@/modules/opportunities/service';
import { createOpportunityInputSchema } from '@/modules/opportunities/types';
import * as usersService from '@/modules/users/service';

// Optional dateFrom / dateTo filter on when the opportunity was created.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const range = parseDateRange(new URL(request.url).searchParams);
    const rows = await opportunitiesService.listOpportunities(range);
    return successResponse({ opportunities: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const body = await request.json();
    const parsed = createOpportunityInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid opportunity payload.', 400);
    }
    const result = await opportunitiesService.createOpportunity(parsed.data);
    return successResponse(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
