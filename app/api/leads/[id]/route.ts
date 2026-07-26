import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import { updateLeadInputSchema } from '@/modules/leads/types';
import * as usersService from '@/modules/users/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const { lead, activities } = await leadsService.getLeadWithActivities(id);
    return successResponse({ lead, activities });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const staffUser = await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const body = await request.json();
    const parsed = updateLeadInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid lead update payload.', 400);
    }
    const result = await leadsService.updateLead(id, parsed.data, staffUser.id);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
