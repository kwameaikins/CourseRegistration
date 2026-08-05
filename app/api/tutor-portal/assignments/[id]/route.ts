import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';
import { updateAssignmentSchema } from '@/modules/assignments/types';

// PATCH /api/tutor-portal/assignments/[id] — edit an assignment, or close it
// to further submissions (status: 'closed'). Ownership is re-checked in the
// service from the assignment's own batch.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const parsed = updateAssignmentSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid assignment payload.',
        400,
      );
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const assignment = await tutorsService.updateAssignmentForTutor(sessionId, id, parsed.data);
    return successResponse(assignment);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/tutor-portal/assignments/[id] — removes the assignment and,
// by FK cascade, every submission against it. The UI confirms first.
export async function DELETE(
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
    await tutorsService.deleteAssignmentForTutor(sessionId, id);
    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
