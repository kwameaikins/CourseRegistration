import { collectFromActiveSources } from '@/modules/news-insights/pipeline/source-collection';
import { triagePendingItems } from '@/modules/news-insights/pipeline/triage';
import { draftPendingStories } from '@/modules/news-insights/pipeline/research-drafting';
import { verifyPendingDrafts } from '@/modules/news-insights/pipeline/verification';
import { routeVerifiedDrafts } from '@/modules/news-insights/pipeline/editorial-risk';
import { runMonitoringSweep } from '@/modules/news-insights/pipeline/monitoring';

// One cron tick (doc Section 8.2's pipeline_jobs status-column approach) —
// advances a bounded batch through every stage in sequence. Bounded per
// stage so one run never runs unboundedly long or unboundedly expensive;
// anything left over is picked up on the next 15-minute tick.
const BATCH_SIZE_PER_STAGE = 8;

export async function runPipelineAdvance() {
  const collection = await collectFromActiveSources();
  const triage = await triagePendingItems(BATCH_SIZE_PER_STAGE);
  const drafting = await draftPendingStories(BATCH_SIZE_PER_STAGE);
  const verification = await verifyPendingDrafts(BATCH_SIZE_PER_STAGE);
  const routing = await routeVerifiedDrafts(BATCH_SIZE_PER_STAGE);
  const monitoring = await runMonitoringSweep();

  return { collection, triage, drafting, verification, routing, monitoring };
}
