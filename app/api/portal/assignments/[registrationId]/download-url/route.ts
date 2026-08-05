import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/assignments/[registrationId]/download-url?submissionId=...
// — a learner downloading their OWN submitted file back (to confirm what
// they sent). The service rejects any submission whose registration_id isn't
// this exact registration.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }
    const submissionId = new URL(request.url).searchParams.get('submissionId');
    if (!submissionId || !z.uuid().safeParse(submissionId).success) {
      throw new AppError('VALIDATION_ERROR', 'A valid submissionId is required.', 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const url = await portalService.getMySubmissionDownloadUrl(
      sessionId,
      registrationId,
      submissionId,
    );
    return successResponse({ url });
  } catch (err) {
    return handleRouteError(err);
  }
}
