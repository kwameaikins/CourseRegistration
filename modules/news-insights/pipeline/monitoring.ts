import * as newsInsightsService from '@/modules/news-insights/service';

// Monitoring & Update Agent (doc Section 4, #7) — Phase 1 scope is
// deliberately minimal: pipeline_jobs reaching 'monitoring' (published, or
// a duplicate absorbed into an already-handled story) are a terminal state
// with no further automated action. Actually watching published stories for
// corrections/postponements/developing-story progress needs a re-fetch +
// re-verify loop this pass doesn't build — corrections are staff-initiated
// via newsInsightsService.addCorrection instead. This function's real job
// today is the doc Section 12 item 2 retention placeholder: purging raw
// source text older than 30 days.
export async function runMonitoringSweep(): Promise<{ purged: number }> {
  return newsInsightsService.purgeStaleRawText();
}
