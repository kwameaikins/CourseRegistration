// Agent dispatch (Agentic layer, 2026-09-03) — the one entry point the daily
// cron calls. Every agent ships DISARMED (env-gated, same posture as nurture
// sequences and campaign live-send): nothing runs until the founder flips its
// flag in Vercel. Each agent is isolated — one failing must not stop the
// others, and none may ever fail the cron itself.
//
//   AGENT_LEAD_TRIAGE_ENABLED=true        daily — triage open leads
//   AGENT_COLLECTIONS_ENABLED=true        daily — draft receivable chases
//   AGENT_EXEC_DIGEST_ENABLED=true        Mondays — email the weekly digest
//   AGENT_CAMPAIGN_PROPOSER_ENABLED=true  Tuesdays — draft one campaign
//   AGENT_MODEL=claude-sonnet-5           model override (optional)
import { runLeadTriageAgent } from '@/modules/agents/lead-triage';
import { runCollectionsAgent } from '@/modules/agents/collections';
import { runExecDigestAgent } from '@/modules/agents/exec-digest';
import { runCampaignProposerAgent } from '@/modules/agents/campaign-proposer';
import { isAgentConfigured } from '@/modules/agents/model';
import type { AgentDispatchSummary, AgentRunResult } from '@/modules/agents/types';

function enabled(flag: string): boolean {
  return process.env[flag] === 'true';
}

async function guarded<T>(
  flag: string,
  scheduledToday: boolean,
  run: () => Promise<T>,
): Promise<AgentRunResult<T>> {
  if (!enabled(flag) || !isAgentConfigured()) return { status: 'disabled' };
  if (!scheduledToday) return { status: 'not_scheduled_today' };
  try {
    return { status: 'ran', summary: await run() };
  } catch (err) {
    console.error(`[agent ${flag}]`, err);
    return { status: 'failed', error: String(err).slice(0, 300) };
  }
}

export async function runAgentDispatch(now = new Date()): Promise<AgentDispatchSummary> {
  const day = now.getUTCDay(); // 1 = Monday, 2 = Tuesday
  const [leadTriage, collections, execDigest, campaignProposer] = await Promise.all([
    guarded('AGENT_LEAD_TRIAGE_ENABLED', true, runLeadTriageAgent),
    guarded('AGENT_COLLECTIONS_ENABLED', true, runCollectionsAgent),
    guarded('AGENT_EXEC_DIGEST_ENABLED', day === 1, () => runExecDigestAgent(now)),
    guarded('AGENT_CAMPAIGN_PROPOSER_ENABLED', day === 2, runCampaignProposerAgent),
  ]);
  return { leadTriage, collections, execDigest, campaignProposer };
}
