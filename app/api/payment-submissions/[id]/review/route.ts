import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as paymentsService from '@/modules/payments/service';
import { paymentSubmissionReviewSchema } from '@/modules/payments/types';

// POST /api/payment-submissions/[id]/review — approve or reject. Approving
// delegates to the existing applyPaymentUpdate (BR-04/05/06/12 all apply
// unchanged); rejecting only ever touches payment_submissions. Finance/
// admin only (paymentsService.reviewPaymentSubmission gates it).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rawBody: unknown = await request.json();
    const parsed = paymentSubmissionReviewSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid request.',
        400,
      );
    }

    const { decision, overrideAmountPaid, overrideTransactionId, overridePaymentDate, reviewNote } =
      parsed.data;
    await paymentsService.reviewPaymentSubmission(
      id,
      decision,
      {
        amountPaid: overrideAmountPaid,
        transactionId: overrideTransactionId,
        paymentDate: overridePaymentDate,
      },
      reviewNote,
    );

    return successResponse({ reviewed: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
