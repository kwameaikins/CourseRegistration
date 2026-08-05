import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import { parseUploadedFile } from '@/lib/uploads';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';
import { ASSIGNMENT_FILE_MAX_BYTES, submitAssignmentSchema } from '@/modules/assignments/types';

// POST /api/portal/assignments — a learner submits (or resubmits) their work
// for one assignment. multipart/form-data, since the file is the submission;
// unlike a payment slip it is never optional.
//
// A resubmission replaces the previous file AND clears any grade/feedback
// already given against it (see submitAssignmentSystem) — the service also
// rejects submission to a closed assignment, and to a reopened one where the
// tutor disallowed resubmission.
export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const parsed = submitAssignmentSchema.safeParse({
      assignmentId: formData.get('assignmentId') ?? undefined,
      registrationId: formData.get('registrationId') ?? undefined,
      participantNotes: formData.get('participantNotes') || undefined,
    });
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid submission payload.',
        400,
      );
    }

    const file = await parseUploadedFile(formData, 'file', {
      maxBytes: ASSIGNMENT_FILE_MAX_BYTES,
      label: 'Your submission',
    });
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'Choose a file to submit.', 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const submission = await portalService.submitAssignment(sessionId, parsed.data, file);

    return successResponse(submission, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
