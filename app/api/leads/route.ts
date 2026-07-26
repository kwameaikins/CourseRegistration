import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import { createLeadInputSchema, listLeadsFiltersSchema } from '@/modules/leads/types';
import * as usersService from '@/modules/users/service';

export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { searchParams } = new URL(request.url);
    const parsed = listLeadsFiltersSchema.safeParse({
      status: searchParams.get('status') ?? undefined,
      leadSource: searchParams.get('leadSource') ?? undefined,
      assignedTo: searchParams.get('assignedTo') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      dueForFollowUp: searchParams.get('dueForFollowUp') === 'true' ? true : undefined,
    });
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid lead filters.', 400);
    }
    const rows = await leadsService.listLeads(parsed.data);
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
