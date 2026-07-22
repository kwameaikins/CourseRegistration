import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as communicationsService from '@/modules/communications/service';
import * as usersService from '@/modules/users/service';
import { messageLogFiltersSchema } from '@/modules/communications/types';

// GET /api/messaging/log — admin review of every email/WhatsApp/SMS sent to
// registrants, same admin-only visibility as the Registration 360 view's
// message history.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin']);
    const url = new URL(request.url);
    const rawFilters = Object.fromEntries(url.searchParams.entries());
    const parsed = messageLogFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid filter parameters.', 400);
    }
    const result = await communicationsService.getMessageLog(parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
