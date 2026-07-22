import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import { manualDeletionRequestSchema } from '@/modules/registrations/types';

// POST /api/participants/[id]/delete-immediately — admin-only, immediate
// hard delete of a wrongly-entered or test Participant, including every one
// of their Registrations and Payments (founder-approved 2026-07-22).
// Deliberately separate from /delete and /hard-delete, which implement the
// DPA erasure flow (30-day cooling-off, refuses while financial records
// exist) — this route is for cleaning up mistakes/test data right away.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = manualDeletionRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'A reason for the deletion is required.', 400);
    }
    await registrationsService.deleteParticipantImmediately(id, parsed.data.reason);
    return successResponse({ participantId: id, deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
