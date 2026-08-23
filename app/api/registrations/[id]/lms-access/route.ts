import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as knowsiaAppService from '@/modules/knowsia-app/service';

// POST /api/registrations/[id]/lms-access — grant this registration's
// participant time-boxed access to the matching self-paced course on the
// study platform (founder rule 2026-08-23: a live seat does not include the
// recordings; staff grant them deliberately, for a stated period). Admin and
// management; the role check lives in the service, as everywhere else.
//
// Re-granting restates the period — running it again with 30 days gives a
// fresh 30 days from now, which is also how an expired grant is renewed.

const grantSchema = z.object({
  // A stated period is required by rule. Ten years is the sanity ceiling,
  // not a product concept.
  days: z.number().int().min(1).max(3650),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'days (1-3650) is required.',
        400,
      );
    }

    const result = await knowsiaAppService.grantLmsAccess(id, parsed.data.days);
    return successResponse({ registrationId: id, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
