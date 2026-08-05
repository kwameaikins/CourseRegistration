import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as assignmentsService from '@/modules/assignments/service';
import { createAssignmentSchema } from '@/modules/assignments/types';

// GET /api/live-sessions/assignments?batchId=... — staff view of the
// assignments set on a batch, with submission/review counts. Admin/management
// gate lives in the service (matches the /live-sessions screen).
export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId || !z.uuid().safeParse(batchId).success) {
      throw new AppError('VALIDATION_ERROR', 'A valid batchId is required.', 400);
    }
    const assignments = await assignmentsService.getAssignmentsForBatch(batchId);
    return successResponse({ assignments });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/live-sessions/assignments — admin sets an assignment on any
// batch (tutors do the same from their own portal, scoped to their batches).
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
    const assignment = await assignmentsService.createAssignmentAsStaff(parsed.data);
    return successResponse(assignment, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
