import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as liveSessionsService from '@/modules/live-sessions/service';
import { liveSessionInputSchema } from '@/modules/live-sessions/types';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    await usersService.requireRole(['admin', 'tutor', 'management']);
    const liveSessions = await liveSessionsService.getLiveSessions();
    return successResponse({ liveSessions });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    const staffUser = await usersService.requireRole(['admin']);
    const parsed = liveSessionInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid live session data.',
        400,
      );
    }
    const liveSession = await liveSessionsService.createLiveSession(parsed.data, staffUser.id);
    return successResponse(liveSession, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}