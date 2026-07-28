import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';
import { feedbackSubmissionSchema } from '@/modules/feedback/types';

// POST /api/portal/feedback/[registrationId] — session-gated in-portal
// feedback submission for one of this participant's own registrations. No
// GET: the dashboard payload from /api/portal/me already carries everything
// the panel needs (course name, payment status, feedbackSubmitted).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }

    const parsed = feedbackSubmissionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid feedback.',
        400,
      );
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const result = await portalService.submitPortalFeedback(sessionId, registrationId, parsed.data);
    return successResponse({ submitted: true, ...result }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
