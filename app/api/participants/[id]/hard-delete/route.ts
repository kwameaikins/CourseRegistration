import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';

// POST /api/participants/[id]/hard-delete — DPA-02 Step 2. Deliberately a
// separate, manual admin action (Document 5, Section 9): the database
// function enforces the 30-day minimum after soft delete and writes to
// deletion_log. Participants with existing Registrations are refused at the
// database level (ON DELETE RESTRICT) to preserve financial audit records.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    try {
      await registrationsService.hardDeleteParticipant(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not eligible for hard delete')) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Hard delete requires the soft delete to be at least 30 days old.',
          400,
        );
      }
      if (message.includes('violates foreign key constraint')) {
        throw new AppError(
          'VALIDATION_ERROR',
          'This Participant has Registrations with financial records that must be retained. The soft-delete anonymisation is the DPA-compliant end state.',
          400,
        );
      }
      throw err;
    }
    return successResponse({ participantId: id, hardDeleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
