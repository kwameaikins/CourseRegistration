import { captureToSentry, errorResponse } from '@/lib/errors';
import { isValidPaystackSignature } from '@/lib/paystack/client';
import { processWebhookEvent } from '@/modules/payments/paystack-webhook-handler';

// POST /api/webhooks/paystack — F1.05 (Document 5, Section 7).
//
// Response contract: 401 for an invalid signature; 200 for every validly
// signed and understood webhook — including unmatched payloads — so
// Paystack's retry mechanism never resends something we have already logged.
export async function POST(request: Request) {
  // BR-13: the HMAC is computed over the RAW body. Reading text() before any
  // JSON parsing is mandatory — parse-then-restringify breaks the hash.
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  if (!isValidPaystackSignature(rawBody, signature)) {
    return Response.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' }, 400);
  }

  try {
    const outcome = await processWebhookEvent(payload);

    if (outcome.status === 'unmatched_logged_for_review') {
      // EC-02: anomaly — flagged to Sentry for Admin review, still 200.
      captureToSentry(new Error('Paystack webhook could not be matched to a Registration'), {
        paystack_reference: extractReference(payload),
      });
      return Response.json({ status: 'unmatched_logged_for_review' }, { status: 200 });
    }
    if (outcome.status === 'already_processed' || outcome.status === 'ignored_event') {
      return Response.json({ status: outcome.status }, { status: 200 });
    }
    return Response.json(
      { status: 'processed', paymentStatus: outcome.paymentStatus },
      { status: 200 },
    );
  } catch (err) {
    // Webhook processing failures must be visible immediately (Document 7,
    // Section 5.2) with the reference tagged for payment-dispute lookup.
    captureToSentry(err, { paystack_reference: extractReference(payload) });
    console.error('[paystack webhook]', err);
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Webhook processing failed.' },
      500,
    );
  }
}

function extractReference(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'data' in payload &&
    typeof (payload as { data: unknown }).data === 'object' &&
    (payload as { data: { reference?: unknown } }).data !== null
  ) {
    const reference = (payload as { data: { reference?: unknown } }).data.reference;
    if (typeof reference === 'string') return reference;
  }
  return 'unknown';
}
