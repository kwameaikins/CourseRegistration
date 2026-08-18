import { errorResponse } from '@/lib/errors';

// GET /api/cron/news-pipeline-advance — DECOMMISSIONED 2026-08-18 (founder
// decision: "kill the news insight").
//
// This route used to advance the Knowsia Insights pipeline one bounded batch
// per stage. It is now a 410 and deliberately does NOT import
// modules/news-insights/pipeline/orchestrator, so there is no code path from
// an HTTP request to runPipelineAdvance() at all. That matters because every
// advance spends real Anthropic credit per story (~$0.05 measured), and
// nothing bounded daily volume — Document 7 §13 and CLAUDE.md record that the
// theoretical ceiling was ~768 drafts/day if source volume ever rose.
//
// The scheduler that called this is gone too: .github/workflows/
// news-pipeline-advance.yml was deleted, and the replacement Cloudflare worker
// (scripts/cron-worker) deliberately does not list this path.
//
// Nothing else was removed. modules/news-insights, the /editorial dashboard,
// the public /news pages and all 11 tables are intact and still serve the
// already-published articles. To revive: restore the import and the
// runPipelineAdvance() call, and add the path back to the worker's ROUTES.
//
// No auth check remains, because there is nothing left to protect — the
// response is a constant and touches neither the database nor any provider.
export async function GET() {
  return errorResponse(
    {
      code: 'GONE',
      message: 'The Knowsia Insights pipeline was decommissioned on 2026-08-18.',
    },
    410,
  );
}
