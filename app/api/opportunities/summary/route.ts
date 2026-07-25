import { handleRouteError, successResponse } from '@/lib/errors';
import * as opportunitiesService from '@/modules/opportunities/service';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const summary = await opportunitiesService.getPipelineSummary();
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
