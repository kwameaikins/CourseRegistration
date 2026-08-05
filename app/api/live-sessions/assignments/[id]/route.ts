import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as assignmentsService from '@/modules/assignments/service';
import { updateAssignmentSchema } from '@/modules/assignments/types';

// PATCH /api/live-sessions/assignments/[id] — admin edits an assignment or
// closes it to further submissions.
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
    const assignment = await assignmentsService.updateAssignmentAsStaff(id, parsed.data);
    return successResponse(assignment);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/live-sessions/assignments/[id] — removes the assignment and,
// by FK cascade, every submission against it.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    await assignmentsService.deleteAssignmentAsStaff(id);
    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
