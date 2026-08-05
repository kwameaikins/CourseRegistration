import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

// GET /api/tutor-portal/submissions/[id]/download-url — short-lived (5 min)
// presigned R2 URL so a tutor can open a learner's submitted file. The
// service proves the submission's assignment belongs to one of this tutor's
// own batches before signing.
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
    const url = await tutorsService.getSubmissionDownloadUrlForTutor(sessionId, id);
    return successResponse({ url });
  } catch (err) {
    return handleRouteError(err);
  }
}
