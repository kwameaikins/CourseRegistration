// Marketing campaign proposer (Agentic layer, 2026-09-03).
//
// Weekly: looks at what is open for sale and the lead pool, and drafts ONE
// campaign into the existing campaigns workspace. It creates a DRAFT — the
// human queue → typed-confirmation → capped-send machinery is the approval
// gate, untouched. Names are prefixed "[Agent]" so its work is always
// distinguishable and so the once-a-week dedup can find its own drafts.
import * as campaignsService from '@/modules/campaigns/service';
import * as leadsService from '@/modules/leads/service';
import * as agentsRepository from '@/modules/agents/repository';
import { runJsonAgent } from '@/modules/agents/model';
import type { CampaignProposerSummary } from '@/modules/agents/types';

const AGENT_PREFIX = '[Agent] ';
const DEDUP_DAYS = 7;

interface CampaignProposal {
  name: string;
  messageSubject: string;
  messageBody: string;
  filterStatus?: string | null;
  filterLeadSource?: string | null;
  filterMinScore?: number | null;
  reason: string;
}

export async function runCampaignProposerAgent(): Promise<CampaignProposerSummary> {
  // One agent draft a week: if last week's is still sitting unreviewed,
  // piling up more drafts helps nobody.
  const existing = await campaignsService.listCampaigns();
  const cutoff = Date.now() - DEDUP_DAYS * 86_400_000;
  const recentAgentDraft = existing.find(
    (campaign) =>
      campaign.name.startsWith(AGENT_PREFIX) &&
      new Date(campaign.createdAt).getTime() > cutoff,
  );
  if (recentAgentDraft) {
    return { created: false, campaignId: null, skippedReason: 'recent agent draft exists' };
  }

  const [batches, leads] = await Promise.all([
    agentsRepository.selectUpcomingBatches(),
    leadsService.listLeads(),
  ]);
  if (batches.length === 0) {
    return { created: false, campaignId: null, skippedReason: 'no upcoming batches to sell' };
  }

  const poolByStatus: Record<string, number> = {};
  const poolBySource: Record<string, number> = {};
  for (const lead of leads) {
    if (lead.status === 'Enrolled') continue;
    poolByStatus[lead.status] = (poolByStatus[lead.status] ?? 0) + 1;
    poolBySource[lead.leadSource] = (poolBySource[lead.leadSource] ?? 0) + 1;
  }

  const prompt = `You are the marketing agent for Knowsia, a Ghanaian professional-training company (live online evening courses, payment plans, GHS pricing). Draft ONE email campaign to the lead pool promoting what is open for registration. A human will review, edit and send it — write something they would be proud to approve.

Open cohorts:
${JSON.stringify(batches)}

Lead pool (excluding already-enrolled) by status: ${JSON.stringify(poolByStatus)}
By source: ${JSON.stringify(poolBySource)}

Recent campaign names (do not repeat an angle just used): ${JSON.stringify(
    existing.slice(0, 5).map((campaign) => campaign.name),
  )}

Segment options — status one of New/Qualified/Follow-up/Lost or null for all; leadSource one of WhatsApp/Facebook/LinkedIn/Referral/Website/Other or null for all; minScore 0-100 or null.

Write in a warm, concrete, Ghana-appropriate voice. Mention real cohort names, start dates and fees from the data. Subject under 70 characters. Body under 1500 characters, plain paragraphs. Tokens {{firstName}} and {{fullName}} are available.

Reply with ONLY JSON:
{"name": "short internal campaign name", "messageSubject": "...", "messageBody": "...", "filterStatus": null, "filterLeadSource": null, "filterMinScore": null, "reason": "one sentence on the targeting choice"}`;

  const proposal = await runJsonAgent<CampaignProposal>(prompt, { maxTokens: 2500 });

  const campaign = await campaignsService.createCampaign(
    {
      name: `${AGENT_PREFIX}${proposal.name}`.slice(0, 150),
      channel: 'email',
      messageSubject: proposal.messageSubject?.slice(0, 200) ?? null,
      messageBody: proposal.messageBody.slice(0, 2000),
      audienceType: 'leads',
      filterStatus: proposal.filterStatus ?? null,
      filterLeadSource: proposal.filterLeadSource ?? null,
      filterMinScore: proposal.filterMinScore ?? null,
    },
    // No staff session behind a cron run; the [Agent] prefix carries the
    // attribution a null author cannot.
    null,
  );
  return { created: true, campaignId: campaign.id, skippedReason: null };
}
