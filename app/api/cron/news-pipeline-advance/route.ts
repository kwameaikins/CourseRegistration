import { captureToSentry, errorResponse, successResponse } from '@/lib/errors';
import { runPipelineAdvance } from '@/modules/news-insights/pipeline/orchestrator';

// GET /api/cron/news-pipeline-advance — advances the Knowsia Insights
// pipeline (doc Section 8.2's pipeline_jobs status-column approach) one
// bounded batch per stage. Vercel Hobby caps cron jobs at two, both already
// used by /api/cron/reminders and /api/cron/attendance, so this is polled
// by a free external scheduler instead (see
// .github/workflows/news-pipeline-advance.yml), same pattern as
// /api/cron/class-reminders-frequent. Naturally a no-op / dormant until at
// least one active news_sources row exists — nothing here fabricates
// sources.
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid cron secret.' }, 401);
  }

  try {
    const summary = await runPipelineAdvance();
    return successResponse(summary);
  } catch (err) {
    captureToSentry(err, { job: 'cron_news_pipeline_advance' });
    console.error('[cron news-pipeline-advance]', err);
    return errorResponse({ code: 'INTERNAL_ERROR', message: 'News pipeline advance run failed.' }, 500);
  }
}
