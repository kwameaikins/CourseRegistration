import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as attendanceService from '@/modules/attendance/service';

const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(500).optional(),
});

// POST /api/attendance/exceptions/[id]/review — admin/management approves
// or rejects a tutor-raised attendance exception. Approving a
// correction_request is the only path (besides the Zoom-sync cron) that
// ever writes to `attendance` (BR-34).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid exception id.', 400);
    }
    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid review payload.', 400);
    }
    await attendanceService.reviewAttendanceException(
      id,
      parsed.data.decision,
      parsed.data.reviewNote,
    );
    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
