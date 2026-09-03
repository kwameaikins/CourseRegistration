import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe';
import * as marketingConsentService from '@/modules/marketing-consent/service';

const bodySchema = z.object({
  email: z.email(),
  token: z.string().min(10).max(64),
});

// POST /api/unsubscribe — public, HMAC-verified (Revenue OS Phase 2,
// 2026-09-03). Only the holder of the server secret can mint a valid token,
// so this cannot be used to unsubscribe someone else by guessing.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid unsubscribe request.', 400);
    }
    if (!verifyUnsubscribeToken(parsed.data.email, parsed.data.token)) {
      throw new AppError('FORBIDDEN', 'This unsubscribe link is not valid.', 403);
    }
    await marketingConsentService.optOut(parsed.data.email, 'link');
    return successResponse({ unsubscribed: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
