import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';

const notesUpdateSchema = z.object({
  notes: z.string().trim().max(2000).nullable(),
});

// PATCH /api/registrations/[id] — inline Notes editing on the Registration
// List (F1.03; admin and marketing only, per Document 8 Section 4).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = notesUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid notes value.', 400);
    }
    await registrationsService.updateNotes(id, parsed.data.notes);
    return successResponse({ registrationId: id });
  } catch (err) {
    return handleRouteError(err);
  }
}
