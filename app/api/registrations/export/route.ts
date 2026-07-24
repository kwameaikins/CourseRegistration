import { AppError, handleRouteError } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import { registrationListFiltersSchema } from '@/modules/registrations/types';

// GET /api/registrations/export — CSV download for the staff Registrations
// and Payments screens. Accepts the same filters as GET /api/registrations
// (system review, 2026-07-24) but ignores page/limit — every matching row
// goes into the file, not one page.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawFilters = Object.fromEntries(url.searchParams.entries());
    const parsed = registrationListFiltersSchema.safeParse(rawFilters);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid filter parameters.', 400);
    }

    const {
      courseId,
      batchId,
      registrationStatus,
      paymentStatus,
      leadSource,
      dateFrom,
      dateTo,
      search,
    } = parsed.data;
    const csv = await registrationsService.exportRegistrationsCsv({
      courseId,
      batchId,
      registrationStatus,
      paymentStatus,
      leadSource,
      dateFrom,
      dateTo,
      search,
    });

    const fileName = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
