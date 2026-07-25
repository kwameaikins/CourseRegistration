import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as liveSessionsService from '@/modules/live-sessions/service';
import { liveSessionUpdateSchema } from '@/modules/live-sessions/types';
import * as usersService from '@/modules/users/service';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staffUser = await usersService.requireRole(['admin']);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      throw new AppError('NOT_FOUND', 'Live session not found.', 404);
    }
    const parsed = liveSessionUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid live session update.',
        400,
      );
    }
    const liveSession = await liveSessionsService.updateLiveSession(id, parsed.data, staffUser.id);
    return successResponse(liveSession);
  } catch (err) {
    return handleRouteError(err);
  }
}