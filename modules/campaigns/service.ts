import { sendTransactionalEmail } from '@/lib/resend/client';
import { sendSmsMessage } from '@/lib/arkesel/client';
import { AppError } from '@/lib/errors';
import * as campaignsRepository from '@/modules/campaigns/repository';
import * as leadsService from '@/modules/leads/service';
import * as registrationsService from '@/modules/registrations/service';
import type { Lead } from '@/modules/leads/types';
import type { PaymentStatus, RegistrationStatus } from '@/lib/domain/types';
import type {
  Campaign,
  CampaignMember,
  CampaignPreview,
  CampaignSendSettings,
  CreateCampaignInput,
  SendCampaignInput,
  SendCampaignResult,
} from '@/modules/campaigns/types';
import {
  LIVE_SEND_SUPPORTED_CHANNELS,
  MAX_LIVE_SEND_RECIPIENTS,
} from '@/modules/campaigns/types';
import type { Database } from '@/lib/supabase/database.types';

const DEFAULT_CAMPAIGN_FROM = 'Knowsia <reg@knowsia.com>';

type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type CampaignMemberRow = Database['public']['Tables']['campaign_members']['Row'];
type CampaignSendSettingRow = Database['public']['Tables']['campaign_send_settings']['Row'];

// Mirrors the toLead/toOpportunity mapper pattern used elsewhere.
function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel as Campaign['channel'],
    messageSubject: row.message_subject,
    messageBody: row.message_body,
    audienceType: (row.audience_type as Campaign['audienceType']) ?? 'leads',
    filterLeadSource: row.filter_lead_source,
    filterStatus: row.filter_status,
    filterMinScore: row.filter_min_score,
    filterBatchId: row.filter_batch_id ?? null,
    filterCourseId: row.filter_course_id ?? null,
    filterPaymentStatus: row.filter_payment_status ?? null,
    filterRegistrationStatus: row.filter_registration_status ?? null,
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
    registrationId: row.registration_id ?? null,
    previewMessage: row.preview_message,
    sentAt: row.sent_at,
    sendError: row.send_error,
    createdAt: row.created_at,
  };
}

function toSendSetting(row: CampaignSendSettingRow): CampaignSendSettings {
  return {
    channel: row.channel as CampaignSendSettings['channel'],
    liveEnabled: row.live_enabled,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

// A campaign recipient, whichever audience it came from — a Lead has
// `company`, a registration doesn't (renders {{company}} empty for that
// audience, same "unknown tokens left visible" philosophy as before).
interface CampaignRecipient {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company?: string | null;
}

// Fills {{firstName}}, {{fullName}}, {{company}} tokens in campaign copy.
// Unknown tokens are left as-is so typos remain visible in previews.
function renderMessage(template: string, recipient: CampaignRecipient): string {
  const firstName = recipient.fullName.trim().split(/\s+/)[0] ?? recipient.fullName;
  return template
    .replaceAll('{{firstName}}', firstName)
    .replaceAll('{{fullName}}', recipient.fullName)
    .replaceAll('{{company}}', recipient.company ?? '');
}

function renderHtml(message: string): string {
  const escaped = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;white-space:pre-wrap">${escaped}</div>`;
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

async function matchRegistrations(campaign: Campaign): Promise<CampaignRecipient[]> {
  const { registrations } = await registrationsService.listRegistrations({
    batchId: campaign.filterBatchId ?? undefined,
    courseId: campaign.filterCourseId ?? undefined,
    paymentStatus: (campaign.filterPaymentStatus as PaymentStatus | null) ?? undefined,
    registrationStatus:
      (campaign.filterRegistrationStatus as RegistrationStatus | null) ?? undefined,
    page: 1,
    limit: 500,
  });
  return registrations.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
  }));
}

// Resolves a campaign's matched audience regardless of which type it targets
// — leads keep their richer Lead shape for renderMessage's {{company}}
// token, registrations map down to the shared CampaignRecipient shape.
async function matchAudience(campaign: Campaign): Promise<CampaignRecipient[]> {
  if (campaign.audienceType === 'registrations') return matchRegistrations(campaign);
  return matchLeads(campaign);
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

export async function listSendSettings(): Promise<CampaignSendSettings[]> {
  const rows = await campaignsRepository.selectSendSettings();
  return rows.map(toSendSetting);
}

export async function updateSendSetting(
  channel: Campaign['channel'],
  liveEnabled: boolean,
  updatedBy: string | null,
): Promise<CampaignSendSettings> {
  const row = await campaignsRepository.updateSendSetting(channel, liveEnabled, updatedBy);
  return toSendSetting(row);
}

// DRY RUN ONLY: computes who a campaign would reach and what they'd receive
// without persisting anything or contacting any provider.
export async function previewCampaign(id: string): Promise<CampaignPreview> {
  const campaign = await getCampaignById(id);
  const matched = await matchAudience(campaign);
  return {
    matchedLeadCount: matched.length,
    sample: matched.slice(0, 5).map((recipient) => ({
      leadId: recipient.id,
      leadName: recipient.fullName,
      previewMessage: renderMessage(campaign.messageBody, recipient),
    })),
  };
}

// Queue remains dry run: records rendered previews only, never dispatches.
export async function queueCampaign(id: string): Promise<Campaign> {
  const campaign = await getCampaignById(id);
  if (campaign.status !== 'draft') {
    throw new AppError('CONFLICT', 'Campaign has already been queued.', 409);
  }

  const isRegistrationAudience = campaign.audienceType === 'registrations';
  const matched = await matchAudience(campaign);
  if (matched.length === 0) {
    throw new AppError(
      isRegistrationAudience ? 'NO_MATCHING_REGISTRATIONS' : 'NO_MATCHING_LEADS',
      `No ${isRegistrationAudience ? 'registrations' : 'leads'} match this campaign's filters.`,
      400,
    );
  }

  const memberRows = matched.map((recipient) => ({
    campaign_id: campaign.id,
    ...(isRegistrationAudience ? { registration_id: recipient.id } : { lead_id: recipient.id }),
    preview_message: renderMessage(campaign.messageBody, recipient),
  }));
  await campaignsRepository.insertCampaignMembers(memberRows);

  const updated = await campaignsRepository.markCampaignQueued(id);
  return toCampaign(updated);
}

export async function sendCampaign(
  id: string,
  input: SendCampaignInput,
): Promise<SendCampaignResult> {
  const campaign = await getCampaignById(id);
  if (campaign.status !== 'queued') {
    throw new AppError('CONFLICT', 'Only a queued campaign can be sent.', 409);
  }
  if (!(LIVE_SEND_SUPPORTED_CHANNELS as readonly string[]).includes(campaign.channel)) {
    throw new AppError(
      'UNSUPPORTED_CHANNEL',
      'Live sending is currently wired for email and SMS campaigns only.',
      400,
    );
  }

  const setting = await campaignsRepository.selectSendSettingByChannel(campaign.channel);
  if (!setting?.live_enabled) {
    throw new AppError(
      'LIVE_SEND_DISABLED',
      'Live sending is disabled for this campaign channel.',
      403,
    );
  }

  const members = await campaignsRepository.selectCampaignMembers(campaign.id);
  if (members.length === 0) {
    throw new AppError('NO_RECIPIENTS', 'This campaign has no queued recipients.', 400);
  }
  if (members.length > MAX_LIVE_SEND_RECIPIENTS) {
    throw new AppError(
      'RECIPIENT_LIMIT_EXCEEDED',
      `Live sends are capped at ${MAX_LIVE_SEND_RECIPIENTS} recipients per campaign.`,
      400,
    );
  }
  if (input.confirmedRecipientCount !== members.length) {
    throw new AppError(
      'CONFIRMATION_MISMATCH',
      'The confirmed recipient count does not match the queued audience.',
      400,
    );
  }
  if (input.confirmationText !== `SEND ${members.length}`) {
    throw new AppError(
      'CONFIRMATION_MISMATCH',
      `Type SEND ${members.length} to confirm this live send.`,
      400,
    );
  }

  const isRegistrationAudience = campaign.audienceType === 'registrations';
  const recipients = await matchAudience(campaign);
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  let sent = 0;
  let failed = 0;

  for (const member of members) {
    if (member.sent_at) {
      sent += 1;
      continue;
    }
    const recipient = recipientById.get(
      (isRegistrationAudience ? member.registration_id : member.lead_id) ?? '',
    );
    const destination = campaign.channel === 'email' ? recipient?.email : recipient?.phone;
    if (!destination) {
      failed += 1;
      await campaignsRepository.markCampaignMemberFailed(
        member.id,
        `${isRegistrationAudience ? 'Registrant' : 'Lead'} has no ${campaign.channel === 'email' ? 'email address' : 'phone number'}.`,
      );
      continue;
    }

    try {
      if (campaign.channel === 'email') {
        await sendTransactionalEmail({
          to: destination,
          from: process.env.CAMPAIGN_EMAIL_FROM ?? DEFAULT_CAMPAIGN_FROM,
          subject: campaign.messageSubject || campaign.name,
          html: renderHtml(member.preview_message),
        });
      } else {
        await sendSmsMessage({ toPhone: destination, message: member.preview_message });
      }
      sent += 1;
      await campaignsRepository.markCampaignMemberSent(member.id, new Date().toISOString());
    } catch (err) {
      failed += 1;
      await campaignsRepository.markCampaignMemberFailed(
        member.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  const updated = await campaignsRepository.markCampaignSent(id);
  return { campaign: toCampaign(updated), attempted: members.length, sent, failed };
}
