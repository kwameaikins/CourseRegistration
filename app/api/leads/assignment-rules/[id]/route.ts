import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import { updateLeadAssignmentRuleInputSchema } from '@/modules/leads/types';
import * as usersService from '@/modules/users/service';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin']);
    const { id } = await params;
    const body = await request.json();
    const parsed = updateLeadAssignmentRuleInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid assignment rule payload.', 400);
    }
    const result = await leadsService.updateAssignmentRule(id, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
