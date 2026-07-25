import { z } from 'zod';

// Campaign workspace (Revenue OS Phase 2 roadmap item): staff compose a
// message targeted at a filtered slice of leads. DRY-RUN ONLY BY DESIGN —
// "queueing" a campaign computes the matching audience and renders a preview
// of what would be sent to each lead, but never calls a real email/WhatsApp/
// SMS provider. See the campaigns migration header for the same note.
export const CAMPAIGN_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_STATUSES = ['draft', 'queued'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

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
  createdAt: string;
}

// A dry-run preview of who a campaign would reach and what they'd receive —
// computed on demand, never persisted.
export interface CampaignPreview {
  matchedLeadCount: number;
  sample: { leadId: string; leadName: string; previewMessage: string }[];
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
