import { captureToSentry, errorResponse, successResponse } from '@/lib/errors';
import * as communicationsService from '@/modules/communications/service';
import * as feedbackService from '@/modules/feedback/service';
import * as voiceService from '@/modules/voice/service';
import * as leadsService from '@/modules/leads/service';
import * as partnersService from '@/modules/partners/service';

// GET /api/cron/reminders — F1.07 (E03–E06), triggered daily at 07:00 UTC by
// Vercel Cron (BR-17). Also dispatches post-course feedback requests for
// batches that ended yesterday (Vercel Hobby caps cron jobs at two, both
// taken — reminders and attendance). Idempotent throughout: re-running never
// duplicates a send (BR-07).
export async function GET(request: Request) {
  // CRON_SECRET is validated before any processing (Document 5, Section 8).
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const summary = await communicationsService.runDailyReminders();
    // Payment plans (founder-approved 2026-07-24) — independent schedule,
    // same idempotency guarantee, bundled into this cron for the same
    // Vercel Hobby two-job cap reason as feedback/voice below.
    const installments = await communicationsService.runInstallmentReminders();
    const feedback = await feedbackService.runFeedbackRequestDispatch();
    // Voice calls are dispatched now but dialed inside the 10:00 Ghana
    // calling window via Vapi schedulePlan.
    const voice = await voiceService.runVoiceCallDispatch();
    // Lead follow-up nudges (2026-07-26) — bundled here for the same
    // Vercel Hobby two-cron-job cap reason as feedback/voice above.
    const leadFollowUps = await leadsService.runFollowUpDispatch();
    // Class reminders (2026-08-01) — the 24h-before case only needs a daily
    // check; the 2h-before case is also checked here as a bonus catch, but is
    // reliably covered by the frequent external-scheduler route instead (see
    // app/api/cron/class-reminders-frequent). Upsell is also date-based
    // ("3 days after end date"), so a daily check suffices for it too.
    const classReminders = await communicationsService.runClassReminderDispatch();
    const upsell = await communicationsService.runUpsellMessageDispatch();
    // Partner commission qualification (2026-08-02) — flips pending ->
    // approved once qualifies_at has passed. Bundled here for the same
    // Vercel Hobby two-cron-job cap reason as everything else above.
    const partnerCommissions = await partnersService.runCommissionQualificationDispatch();
    return successResponse({
      ...summary,
      installments,
      feedback,
      voice,
      leadFollowUps,
      classReminders,
      upsell,
      partnerCommissions,
    });
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
