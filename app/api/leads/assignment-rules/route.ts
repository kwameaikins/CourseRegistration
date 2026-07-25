import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import { createLeadAssignmentRuleInputSchema } from '@/modules/leads/types';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    await usersService.requireRole(['admin']);
    const rules = await leadsService.listAssignmentRules();
    return successResponse({ rules });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    await usersService.requireRole(['admin']);
    const body = await request.json();
    const parsed = createLeadAssignmentRuleInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid assignment rule payload.', 400);
    }
    const result = await leadsService.createAssignmentRule(parsed.data);
    return successResponse(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
