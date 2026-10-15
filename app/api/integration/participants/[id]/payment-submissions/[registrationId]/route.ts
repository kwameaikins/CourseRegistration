import { z } from 'zod';

import { errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import {
  PAYMENT_SUBMISSION_SLIP_MAX_BYTES,
  PAYMENT_SUBMISSION_SLIP_MIME_TYPES,
  paymentSubmissionInputSchema,
} from '@/modules/payments/types';
import * as portalService from '@/modules/portal/service';

// /api/integration/participants/[id]/payment-submissions/[registrationId] —
// "I paid by MoMo / bank transfer", for KnowsiaApp's signed-in student
// (one-portal merge Phase 3b, 2026-10-15). The same submission the portal
// makes: it waits in finance's review queue and is applied only on approval.
// GET lists this registration's submissions (status, review note); POST is
// multipart/form-data like the portal's, with an optional `slip` file.

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

type Params = { params: Promise<{ id: string; registrationId: string }> };

async function ids(params: Params['params']) {
  const { id, registrationId } = await params;
  return z.uuid().safeParse(id).success && z.uuid().safeParse(registrationId).success ? { id, registrationId } : null;
}

export async function GET(request: Request, { params }: Params) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const found = await ids(params);
    if (!found) return errorResponse({ code: 'NOT_FOUND', message: 'Not found.' }, 404);
    const submissions = await portalService.listPaymentSubmissionsForParticipant(found.id, found.registrationId);
    return successResponse({ submissions });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const found = await ids(params);
    if (!found) return errorResponse({ code: 'NOT_FOUND', message: 'Not found.' }, 404);
    const form = await request.formData();
    const parsed = paymentSubmissionInputSchema.safeParse({
      registrationId: found.registrationId,
      method: form.get('method') ?? undefined,
      amount: form.get('amount') ?? undefined,
      transactionReference: form.get('transactionReference') || undefined,
      paymentDate: form.get('paymentDate') ?? undefined,
      participantNotes: form.get('participantNotes') || undefined,
    });
    if (!parsed.success) {
      return errorResponse({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
    }
    let slip: { buffer: Buffer; contentType: string; extension: string } | undefined;
    const file = form.get('slip');
    if (file instanceof File && file.size > 0) {
      if (file.size > PAYMENT_SUBMISSION_SLIP_MAX_BYTES) {
        return errorResponse({ code: 'VALIDATION_ERROR', message: 'Slip file is too large (max 5MB).' }, 400);
      }
      const extension = EXTENSIONS[file.type];
      if (!extension || !(PAYMENT_SUBMISSION_SLIP_MIME_TYPES as readonly string[]).includes(file.type)) {
        return errorResponse({ code: 'VALIDATION_ERROR', message: 'Slip must be a JPEG, PNG, or PDF file.' }, 400);
      }
      slip = { buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type, extension };
    }
    const submission = await portalService.submitPaymentProofForParticipant(found.id, parsed.data, slip);
    return successResponse(submission);
  } catch (err) {
    return handleRouteError(err);
  }
}
