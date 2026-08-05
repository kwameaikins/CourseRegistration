import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';
import { createAssignmentSchema } from '@/modules/assignments/types';

// GET /api/tutor-portal/assignments?batchId=... — assignments the tutor has
// set on one of their own batches, each with submission/review counts.
export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId || !z.uuid().safeParse(batchId).success) {
      throw new AppError('VALIDATION_ERROR', 'A valid batchId is required.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const assignments = await tutorsService.getAssignmentsForBatch(sessionId, batchId);
    return successResponse(assignments);
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/tutor-portal/assignments — set a new assignment on one of the
// tutor's own batches (ownership checked in the service, never trusted from
// the supplied batchId).
export async function POST(request: Request) {
  try {
    const parsed = createAssignmentSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid assignment payload.',
        400,
      );
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const assignment = await tutorsService.createAssignmentForBatch(sessionId, parsed.data);
    return successResponse(assignment, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
