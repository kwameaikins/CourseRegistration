import { captureToSentry, errorResponse, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';

// POST /api/cron/registrations/auto-lapse — manual trigger for the write-off
// sweep that otherwise runs inside the 07:00 cron (deliberately absent from
// vercel.json's cron list, same as the attendance backfill and the attendee
// feedback dispatch).
//
// Body: { dryRun?: boolean }
// dryRun defaults to TRUE. The nightly run inside /api/cron/reminders is the
// live one; this exists so the first sweep can be inspected before it happens.
// That first run is not a normal night's work — it closes out the ENTIRE
// historic backlog of unpaid no-shows in one pass, and every subsequent run
// only sees whatever aged past the 15-day line that day.
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    // An empty body is a legitimate call ("show me what would happen"), so a
    // missing/unparseable body means defaults rather than a 400.
    const body = await request
      .json()
      .catch(() => ({}) as { dryRun?: boolean });
    const result = await registrationsService.runAutoLapseSweep({
      dryRun: (body as { dryRun?: boolean }).dryRun ?? true,
    });
    if (result.errors.length > 0) {
      captureToSentry(new Error(`Auto-lapse sweep errors: ${result.errors.join(' | ')}`), {
        job: 'registrations_auto_lapse',
        outcome: 'partial_failure',
      });
    }
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
