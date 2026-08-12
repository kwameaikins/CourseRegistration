import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import { lapseRegistrationSchema } from '@/modules/registrations/types';

// POST /api/registrations/[id]/lapse — write off an uncollectible Registration
// (founder direction 2026-08-09). Admin and finance; the role check lives in
// the service, as everywhere else.
//
// Distinct from DELETE on the parent route: that destroys the Registration and
// its Payment row, which is right for a test entry and wrong for a real person
// who registered and then went quiet. This keeps every row and only stops
// treating the balance as collectible.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = lapseRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'A reason for the write-off is required.',
        400,
      );
    }

    await registrationsService.lapseRegistration(id, parsed.data.reason);
    return successResponse({ registrationId: id, lapsed: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/registrations/[id]/lapse — undo, for the late bank transfer or a
// write-off made in error. Restores 'Confirmed' if the fee is settled,
// otherwise 'Registered'.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await registrationsService.reinstateRegistration(id);
    return successResponse({ registrationId: id, reinstated: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
