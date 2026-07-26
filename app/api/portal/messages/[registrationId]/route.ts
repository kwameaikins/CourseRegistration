import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/messages/[registrationId] — session-gated, this
// participant's own email/whatsapp/sms history for one registration.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const messages = await portalService.getMessageHistory(sessionId, registrationId);
    return successResponse(messages);
  } catch (err) {
    return handleRouteError(err);
  }
}
