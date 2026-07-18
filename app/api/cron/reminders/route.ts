import { captureToSentry, errorResponse, successResponse } from '@/lib/errors';
import * as communicationsService from '@/modules/communications/service';

// GET /api/cron/reminders — F1.07 (E03–E06), triggered daily at 07:00 UTC by
// Vercel Cron (BR-17). Idempotent: re-running never duplicates a send (BR-07).
export async function GET(request: Request) {
  // CRON_SECRET is validated before any processing (Document 5, Section 8).
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const summary = await communicationsService.runDailyReminders();
    return successResponse(summary);
  } catch (err) {
    // A failed cron run affects many participants at once — must be visible
    // immediately (Document 7, Section 5.2).
    captureToSentry(err, { job: 'cron_reminders' });
    console.error('[cron reminders]', err);
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Reminder run failed.' },
      500,
    );
  }
}
