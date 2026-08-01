import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!z.uuid().safeParse(id).success || !batchId || !z.uuid().safeParse(batchId).success) {
      throw new AppError('VALIDATION_ERROR', 'A valid material id and batchId are required.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    await tutorsService.removeMaterial(sessionId, id, batchId);
    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
