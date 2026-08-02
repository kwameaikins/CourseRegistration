import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';
import {
  PAYMENT_SUBMISSION_SLIP_MAX_BYTES,
  PAYMENT_SUBMISSION_SLIP_MIME_TYPES,
  paymentSubmissionInputSchema,
} from '@/modules/payments/types';

function extensionForContentType(contentType: string): string | null {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'application/pdf':
      return 'pdf';
    default:
      return null;
  }
}

// POST /api/portal/payment-submissions — requires a valid portal session
// cookie. multipart/form-data (the first formData() use in this codebase —
// every other portal route is JSON) since the slip upload is an optional
// file field alongside the payment fields.
export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const parsed = paymentSubmissionInputSchema.safeParse({
      registrationId: formData.get('registrationId') ?? undefined,
      method: formData.get('method') ?? undefined,
      amount: formData.get('amount') ?? undefined,
      transactionReference: formData.get('transactionReference') || undefined,
      paymentDate: formData.get('paymentDate') ?? undefined,
      participantNotes: formData.get('participantNotes') || undefined,
    });
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid request.',
        400,
      );
    }

    let slip: { buffer: Buffer; contentType: string; extension: string } | undefined;
    const file = formData.get('slip');
    if (file instanceof File && file.size > 0) {
      if (file.size > PAYMENT_SUBMISSION_SLIP_MAX_BYTES) {
        throw new AppError('VALIDATION_ERROR', 'Slip file is too large (max 5MB).', 400);
      }
      if (!(PAYMENT_SUBMISSION_SLIP_MIME_TYPES as readonly string[]).includes(file.type)) {
        throw new AppError('VALIDATION_ERROR', 'Slip must be a JPEG, PNG, or PDF file.', 400);
      }
      const extension = extensionForContentType(file.type);
      if (!extension) {
        throw new AppError('VALIDATION_ERROR', 'Unsupported file type.', 400);
      }
      const arrayBuffer = await file.arrayBuffer();
      slip = { buffer: Buffer.from(arrayBuffer), contentType: file.type, extension };
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const submission = await portalService.submitPaymentProof(sessionId, parsed.data, slip);

    return successResponse(submission);
  } catch (err) {
    return handleRouteError(err);
  }
}

// GET /api/portal/payment-submissions?registrationId=... — the participant's
// own submission history for one registration (status, review note if
// rejected), so the portal can show "awaiting review" / "rejected: ..." and
// let them resubmit.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');
    if (!registrationId) {
      throw new AppError('VALIDATION_ERROR', 'registrationId is required.', 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const submissions = await portalService.listMyPaymentSubmissions(sessionId, registrationId);

    return successResponse({ submissions });
  } catch (err) {
    return handleRouteError(err);
  }
}
