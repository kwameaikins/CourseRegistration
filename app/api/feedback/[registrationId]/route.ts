import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as feedbackService from '@/modules/feedback/service';
import { feedbackSubmissionSchema } from '@/modules/feedback/types';

// Public feedback form endpoints — no session; the unguessable Registration
// UUID in the path is the access token. Responses expose minimal data.

const uuidSchema = z.uuid();

// GET /api/feedback/[registrationId] — form context (course, first name,
// whether already submitted, course interest options).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!uuidSchema.safeParse(registrationId).success) {
      throw new AppError('NOT_FOUND', 'This feedback link is not valid.', 404);
    }
    const context = await feedbackService.getPublicFeedbackContext(registrationId);
    return successResponse(context);
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/feedback/[registrationId] — one submission per Registration.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!uuidSchema.safeParse(registrationId).success) {
      throw new AppError('NOT_FOUND', 'This feedback link is not valid.', 404);
    }
    const parsed = feedbackSubmissionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid feedback.',
        400,
      );
    }
    await feedbackService.submitFeedback(registrationId, parsed.data);
    return successResponse({ submitted: true }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
