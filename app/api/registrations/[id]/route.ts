import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import { manualDeletionRequestSchema } from '@/modules/registrations/types';

const notesUpdateSchema = z.object({
  notes: z.string().trim().max(2000).nullable(),
});

// GET /api/registrations/[id] — the Registration 360° view (system review,
// approved 2026-07-20): every module's data for one Registration, shaped by
// role in the service layer (see `shapeRegistration360ForRole`).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const view = await registrationsService.getRegistration360(id);
    return successResponse(view);
  } catch (err) {
    return handleRouteError(err);
  }
}

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

// DELETE /api/registrations/[id] — admin-only, immediate hard delete of a
// wrongly-entered or test Registration (founder-approved 2026-07-22).
// Distinct from the DPA participant-erasure flow: no cooling-off period,
// and the Payment row is removed rather than preserved.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = manualDeletionRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'A reason for the deletion is required.', 400);
    }
    await registrationsService.deleteRegistration(id, parsed.data.reason);
    return successResponse({ registrationId: id, deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
