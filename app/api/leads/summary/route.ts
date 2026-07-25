import { handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const summary = await leadsService.getPipelineSummary();
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
