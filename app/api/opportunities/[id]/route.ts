import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as opportunitiesService from '@/modules/opportunities/service';
import { updateOpportunityInputSchema } from '@/modules/opportunities/types';
import * as usersService from '@/modules/users/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const opportunity = await opportunitiesService.getOpportunityById(id);
    if (!opportunity) {
      throw new AppError('NOT_FOUND', 'Opportunity not found.', 404);
    }
    return successResponse(opportunity);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const body = await request.json();
    const parsed = updateOpportunityInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid opportunity payload.', 400);
    }
    const result = await opportunitiesService.updateOpportunity(id, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
