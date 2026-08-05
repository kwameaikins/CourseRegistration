import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

// GET /api/tutor-portal/assignments/[id]/submissions — every learner's
// submission for one of the tutor's own assignments, with names merged in
// from the batch roster. Name/email only — BR-33 holds, no payment field.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const submissions = await tutorsService.getSubmissionsForAssignment(sessionId, id);
    return successResponse(submissions);
  } catch (err) {
    return handleRouteError(err);
  }
}
