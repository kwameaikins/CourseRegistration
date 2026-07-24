import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import { transferRegistrationSchema } from '@/modules/registrations/types';

// POST /api/registrations/[id]/transfer — admin-only batch/cohort transfer
// (system review, 2026-07-24).
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
    const parsed = transferRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid transfer request.',
        400,
      );
    }

    await registrationsService.transferRegistration(id, parsed.data);
    return successResponse({ transferred: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
