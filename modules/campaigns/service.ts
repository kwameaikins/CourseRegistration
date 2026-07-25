import { AppError } from '@/lib/errors';
import * as campaignsRepository from '@/modules/campaigns/repository';
import * as leadsService from '@/modules/leads/service';
import type { Lead } from '@/modules/leads/types';
import type {
  Campaign,
  CampaignMember,
  CampaignPreview,
  CreateCampaignInput,
} from '@/modules/campaigns/types';
import type { Database } from '@/lib/supabase/database.types';

type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type CampaignMemberRow = Database['public']['Tables']['campaign_members']['Row'];

// Mirrors the toLead/toOpportunity mapper pattern used elsewhere.
function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel as Campaign['channel'],
    messageSubject: row.message_subject,
    messageBody: row.message_body,
    filterLeadSource: row.filter_lead_source,
    filterStatus: row.filter_status,
    filterMinScore: row.filter_min_score,
    status: row.status as Campaign['status'],
    createdBy: row.created_by,
    queuedAt: row.queued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCampaignMember(row: CampaignMemberRow): CampaignMember {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    leadId: row.lead_id,
    previewMessage: row.preview_message,
    createdAt: row.created_at,
  };
}

// Fills {{firstName}}, {{fullName}}, {{company}} tokens in the campaign's
// message body with the lead's own details. Unknown tokens are left as-is.
function renderMessage(template: string, lead: Lead): string {
  const firstName = lead.fullName.trim().split(/\s+/)[0] ?? lead.fullName;
  return template
    .replaceAll('{{firstName}}', firstName)
    .replaceAll('{{fullName}}', lead.fullName)
    .replaceAll('{{company}}', lead.company ?? '');
}

async function matchLeads(campaign: Campaign): Promise<Lead[]> {
  const leads = await leadsService.listLeads();
  return leads.filter((lead) => {
    if (
      campaign.filterLeadSource &&
      lead.leadSource.toLowerCase() !== campaign.filterLeadSource.toLowerCase()
    ) {
      return false;
    }
    if (campaign.filterStatus && lead.status !== campaign.filterStatus) return false;
    if (campaign.filterMinScore !== null && campaign.filterMinScore !== undefined) {
      if (lead.score < campaign.filterMinScore) return false;
    }
    return true;
  });
}

export async function createCampaign(
  input: CreateCampaignInput,
  createdBy: string | null,
): Promise<Campaign> {
  const row = await campaignsRepository.insertCampaign(input, createdBy);
  return toCampaign(row);
}

export async function listCampaigns(): Promise<Campaign[]> {
  const rows = await campaignsRepository.selectCampaigns();
  return rows.map(toCampaign);
}

export async function getCampaignById(id: string): Promise<Campaign> {
  const row = await campaignsRepository.selectCampaignById(id);
  if (!row) throw new AppError('NOT_FOUND', 'Campaign not found.', 404);
  return toCampaign(row);
}

export async function getCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  const rows = await campaignsRepository.selectCampaignMembers(campaignId);
  return rows.map(toCampaignMember);
}

// DRY RUN ONLY: computes who a campaign would reach and what they'd receive
// without persisting anything or contacting any provider.
export async function previewCampaign(id: string): Promise<CampaignPreview> {
  const campaign = await getCampaignById(id);
  const matched = await matchLeads(campaign);
  return {
    matchedLeadCount: matched.length,
    sample: matched.slice(0, 5).map((lead) => ({
      leadId: lead.id,
      leadName: lead.fullName,
      previewMessage: renderMessage(campaign.messageBody, lead),
    })),
  };
}

// DRY RUN ONLY (Phase 2 scope, explicitly approved): "queueing" a campaign
// records a preview_message row per matched lead for staff review — it never
// calls Resend/Arkesel/WhatsApp or any other real send API. Enabling live
// dispatch is a separate, explicitly-approved future change.
export async function queueCampaign(id: string): Promise<Campaign> {
  const campaign = await getCampaignById(id);
  if (campaign.status !== 'draft') {
    throw new AppError('CONFLICT', 'Campaign has already been queued.', 409);
  }

  const matched = await matchLeads(campaign);
  if (matched.length === 0) {
    throw new AppError('NO_MATCHING_LEADS', 'No leads match this campaign\u2019s filters.', 400);
  }

  const memberRows = matched.map((lead) => ({
    campaign_id: campaign.id,
    lead_id: lead.id,
    preview_message: renderMessage(campaign.messageBody, lead),
  }));
  await campaignsRepository.insertCampaignMembers(memberRows);

  const updated = await campaignsRepository.markCampaignQueued(id);
  return toCampaign(updated);
}
