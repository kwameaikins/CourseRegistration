import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import {
  registrationInputSchema,
  registrationListFiltersSchema,
} from '@/modules/registrations/types';

// POST /api/registrations — F1.01, public (Document 5, Section 2).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }

    const parsed = registrationInputSchema.safeParse(body);
    if (!parsed.success) {
      const consentIssue = parsed.error.issues.find((issue) =>
        issue.path.includes('consentGiven'),
      );
      if (consentIssue) {
        throw new AppError(
          'CONSENT_REQUIRED',
          'You must consent to the processing of your personal data to register.',
          400,
        );
      }
      throw new AppError(
        'VALIDATION_ERROR',
        'Please check the highlighted fields and try again.',
        400,
      );
    }

    const result = await registrationsService.createRegistration(parsed.data);
    return successResponse(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}

// GET /api/registrations — F1.03 staff list with role-based field shaping
// (Document 5, Section 3).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawFilters = Object.fromEntries(url.searchParams.entries());
    const parsed = registrationListFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid filter parameters.', 400);
    }

    const result = await registrationsService.listRegistrations(parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
