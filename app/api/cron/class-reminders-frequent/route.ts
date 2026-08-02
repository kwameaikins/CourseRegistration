import { captureToSentry, errorResponse, successResponse } from '@/lib/errors';
import * as communicationsService from '@/modules/communications/service';

// GET /api/cron/class-reminders-frequent — the class_reminder_2h precision
// the once-daily 07:00 cron can't reliably hit (Vercel Hobby caps cron jobs
// at two, both already used by /api/cron/reminders and /api/cron/attendance).
// Triggered every 15-30 minutes by a free external scheduler (e.g. GitHub
// Actions — see .github/workflows/class-reminders-frequent.yml), not Vercel
// Cron itself. Same CRON_SECRET auth as both existing cron routes. Safe to
// call this often: every send is deduped by its own log-table unique
// constraint, so overlapping runs are a no-op, never a double-send.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const classReminders = await communicationsService.runClassReminderDispatch();
    return successResponse({ classReminders });
  } catch (err) {
    captureToSentry(err, { job: 'cron_class_reminders_frequent' });
    console.error('[cron class-reminders-frequent]', err);
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Class reminder run failed.' },
      500,
    );
  }
}
