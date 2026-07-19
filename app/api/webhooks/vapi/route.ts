import { captureToSentry, errorResponse } from '@/lib/errors';
import { isValidVapiSecret } from '@/lib/vapi/client';
import * as voiceService from '@/modules/voice/service';

// POST /api/webhooks/vapi — end-of-call reports from Vapi. Authenticated by
// the shared server secret configured on the assistant (x-vapi-secret).
// Payload shapes vary between Vapi webhook versions, so fields are read
// defensively from the known locations.
export async function POST(request: Request) {
  if (!isValidVapiSecret(request.headers.get('x-vapi-secret'))) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid webhook secret.' }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' }, 400);
  }

  try {
    const message = (payload as { message?: Record<string, unknown> }).message ?? {};
    if (message.type !== 'end-of-call-report') {
      return Response.json({ status: 'ignored_event' }, { status: 200 });
    }

    const call = (message.call ?? {}) as { id?: string };
    const analysis = (message.analysis ?? {}) as {
      summary?: string;
      structuredData?: Record<string, unknown>;
    };
    const artifact = (message.artifact ?? {}) as { transcript?: string };

    if (!call.id) {
      return Response.json({ status: 'ignored_no_call_id' }, { status: 200 });
    }

    const outcome = await voiceService.handleEndOfCallReport({
      vapiCallId: call.id,
      summary:
        analysis.summary ??
        (typeof message.summary === 'string' ? message.summary : null),
      transcript:
        artifact.transcript ??
        (typeof message.transcript === 'string' ? message.transcript : null),
      structuredData: analysis.structuredData ?? null,
      endedReason: typeof message.endedReason === 'string' ? message.endedReason : null,
    });

    return Response.json({ status: outcome }, { status: 200 });
  } catch (err) {
    captureToSentry(err, { webhook: 'vapi' });
    console.error('[vapi webhook]', err);
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Webhook processing failed.' },
      500,
    );
  }
}
