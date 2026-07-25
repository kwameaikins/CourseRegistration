import { z } from 'zod';

// Campaign workspace (Revenue OS Phase 2 roadmap item): staff compose a
// message targeted at a filtered slice of leads. Queueing a campaign is
// ALWAYS a dry run - it renders a preview of what would be sent to each lead
// but never contacts a provider. Real dispatch only happens via the separate
// sendCampaign() action, and only when that channel's live-sending toggle is
// on (see CampaignSendSettings) - see the campaigns migration header for
// details.
export const CAMPAIGN_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_STATUSES = ['draft', 'queued', 'sent'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// Live sending is capped per send to limit blast radius from a mistake -
// split a bigger audience into multiple smaller campaigns instead.
export const MAX_LIVE_SEND_RECIPIENTS = 100;

// Email uses Resend and SMS uses Arkesel. WhatsApp remains unavailable until
// its provider credentials and approved templates are ready.
export const LIVE_SEND_SUPPORTED_CHANNELS: readonly CampaignChannel[] = ['email', 'sms'] as const;

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  messageSubject: string | null;
  messageBody: string;
  filterLeadSource: string | null;
  filterStatus: string | null;
  filterMinScore: number | null;
  status: CampaignStatus;
  createdBy: string | null;
  queuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMember {
  id: string;
  campaignId: string;
  leadId: string;
  previewMessage: string;
  sentAt: string | null;
  sendError: string | null;
  createdAt: string;
}

// A dry-run preview of who a campaign would reach and what they'd receive -
// computed on demand, never persisted.
export interface CampaignPreview {
  matchedLeadCount: number;
  sample: { leadId: string; leadName: string; previewMessage: string }[];
}

// Admin-managed, per-channel kill switch for real dispatch (defaults off).
export interface CampaignSendSettings {
  channel: CampaignChannel;
  liveEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export const updateCampaignSendSettingInputSchema = z.object({
  liveEnabled: z.boolean(),
});

export type UpdateCampaignSendSettingInput = z.infer<
  typeof updateCampaignSendSettingInputSchema
>;

// Staff must confirm the exact recipient count and type SEND <count> before
// a live send is triggered - a lightweight guard against stale previews and
// accidental blasts.
export const sendCampaignInputSchema = z.object({
  confirmedRecipientCount: z.coerce.number().int().min(1),
  confirmationText: z.string().trim().min(1).max(50),
});

export type SendCampaignInput = z.infer<typeof sendCampaignInputSchema>;

export interface SendCampaignResult {
  campaign: Campaign;
  attempted: number;
  sent: number;
  failed: number;
}

export const createCampaignInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  channel: z.enum(CAMPAIGN_CHANNELS),
  messageSubject: z.string().trim().max(200).nullable().optional(),
  messageBody: z.string().trim().min(1).max(2000),
  filterLeadSource: z.string().trim().max(50).nullable().optional(),
  filterStatus: z.string().trim().max(50).nullable().optional(),
  filterMinScore: z.coerce.number().int().min(0).max(100).nullable().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;
