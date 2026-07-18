import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';

const deletionRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

// POST /api/participants/[id]/delete — DPA-02 Step 1 (soft delete /
// anonymisation, BR-16). Admin only; the SECURITY DEFINER function also
// verifies the caller's role at the database level.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = deletionRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'A reason for the deletion request is required.',
        400,
      );
    }

    const result = await registrationsService.softDeleteParticipant(id);
    console.info(
      `[DPA] Participant ${id} soft-deleted. Reason: ${parsed.data.reason}`,
    );
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
