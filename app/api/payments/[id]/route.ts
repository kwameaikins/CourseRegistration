import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as paymentsService from '@/modules/payments/service';
import { paymentUpdateSchema } from '@/modules/payments/types';

// PATCH /api/payments/[id] — [id] is the registrationId (Document 5,
// Section 6). Finance/admin only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: registrationId } = await params;
    const rawBody: unknown = await request.json();

    // BR-04/BR-12: client-supplied paymentStatus or verifiedBy are discarded
    // silently with a server-side warning — the trigger and session override
    // them regardless, so this indicates a client bug, not a security issue.
    if (rawBody && typeof rawBody === 'object') {
      const body = rawBody as Record<string, unknown>;
      if ('paymentStatus' in body || 'payment_status' in body) {
        console.warn('[payments] client sent paymentStatus — discarded (BR-04)');
        delete body.paymentStatus;
        delete body.payment_status;
      }
      if ('verifiedBy' in body || 'verified_by' in body) {
        console.warn('[payments] client sent verifiedBy — discarded (BR-12)');
        delete body.verifiedBy;
        delete body.verified_by;
      }
    }

    const parsed = paymentUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid payment data.',
        400,
      );
    }

    const result = await paymentsService.updatePaymentByStaff(registrationId, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
