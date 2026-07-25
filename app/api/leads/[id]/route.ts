import { handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import * as usersService from '@/modules/users/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const lead = await leadsService.getLeadById(id);
    return successResponse({ lead });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const body = await request.json();
    const result = await leadsService.updateLead(id, body);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
