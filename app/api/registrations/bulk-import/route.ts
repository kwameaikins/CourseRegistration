import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import { bulkImportRequestSchema } from '@/modules/registrations/types';

// POST /api/registrations/bulk-import — staff backfill of registrations
// collected outside the system (e.g. a Google Form), admin/finance/
// marketing/management only (Document 5 addendum — bulk import).
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }

    const parsed = bulkImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Please check the highlighted fields and try again.',
        400,
      );
    }

    const result = await registrationsService.bulkImportRegistrations(parsed.data);
    return successResponse(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
