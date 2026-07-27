import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await params;
    if (!z.uuid().safeParse(batchId).success) {
      return new Response('Not found', { status: 404 });
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const roster = await tutorsService.getRosterForBatch(sessionId, batchId);
    return successResponse(roster);
  } catch (err) {
    return handleRouteError(err);
  }
}
