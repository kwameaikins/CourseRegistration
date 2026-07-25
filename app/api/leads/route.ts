import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import { createLeadInputSchema } from '@/modules/leads/types';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const rows = await leadsService.listLeads();
    return successResponse({ leads: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const body = await request.json();
    const parsed = createLeadInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid lead payload.', 400);
    }
    const result = await leadsService.createLead(parsed.data);
    return successResponse(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
