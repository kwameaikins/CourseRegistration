import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';
import { reviewSubmissionSchema } from '@/modules/assignments/types';

// PATCH /api/tutor-portal/submissions/[id] — grade and/or give written
// feedback on a submission. Ownership is resolved from the submission's own
// assignment and batch in the service, never from client input.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const parsed = reviewSubmissionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid review payload.',
        400,
      );
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    await tutorsService.reviewSubmissionForTutor(sessionId, id, parsed.data);
    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
