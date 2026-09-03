import { createHmac, timingSafeEqual } from 'crypto';

import { errorResponse, successResponse } from '@/lib/errors';
import * as communicationsRepository from '@/modules/communications/repository';

// POST /api/webhooks/resend — email engagement events (Revenue OS Phase 2,
// 2026-09-03). Resend signs webhooks in the Svix format; verified here with
// no extra dependency. Configure the endpoint in the Resend dashboard for
// `email.opened` and `email.clicked`, and put its signing secret in
// RESEND_WEBHOOK_SECRET (the whsec_… value). Unset → endpoint answers 503,
// nothing else changes.
function verifySvixSignature(
  secret: string,
  payload: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  // Replay window: 5 minutes either side.
  const skewSeconds = Math.abs(Date.now() / 1000 - Number(headers.timestamp));
  if (!Number.isFinite(skewSeconds) || skewSeconds > 300) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${headers.id}.${headers.timestamp}.${payload}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // Header carries space-separated "v1,<sig>" entries (key rotation).
  return headers.signature.split(' ').some((part) => {
    const candidate = part.split(',')[1];
    if (!candidate) return false;
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(candidate);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return errorResponse(
      { code: 'NOT_CONFIGURED', message: 'RESEND_WEBHOOK_SECRET is not set.' },
      503,
    );
  }

  const payload = await request.text();
  const verified = verifySvixSignature(secret, payload, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  });
  if (!verified) {
    return errorResponse({ code: 'FORBIDDEN', message: 'Invalid webhook signature.' }, 403);
  }

  try {
    const event = JSON.parse(payload) as {
      type?: string;
      created_at?: string;
      data?: { email_id?: string };
    };
    const emailId = event.data?.email_id;
    if (emailId && (event.type === 'email.opened' || event.type === 'email.clicked')) {
      await communicationsRepository.recordEmailEngagement(
        emailId,
        event.type === 'email.opened' ? 'opened' : 'clicked',
        event.created_at ?? new Date().toISOString(),
      );
    }
    // Every other event type is acknowledged and ignored — a webhook that
    // 4xxes unhandled types gets disabled by the provider.
    return successResponse({ received: true });
  } catch (err) {
    console.error('[resend webhook]', err);
    return successResponse({ received: true });
  }
}
