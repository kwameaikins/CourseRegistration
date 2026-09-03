// Agentic layer (2026-09-03) — run summaries for the four autonomous agents.
// Everything here is reporting shape; the behavioural contracts live in each
// agent's module header.

export interface LeadTriageSummary {
  evaluated: number;
  suggestions: number;
  followUpsScheduled: number;
  scoresAdjusted: number;
  skippedCooldown: number;
  errors: string[];
}

export interface CollectionsSummary {
  evaluated: number;
  drafts: number;
  escalations: number;
  // Debtors with no lead row — nowhere to surface a suggestion; reported so
  // the gap is visible rather than silent.
  noLeadRow: number;
  skippedCooldown: number;
  errors: string[];
}

export interface ExecDigestSummary {
  sent: number;
  recipients: string[];
  error: string | null;
}

export interface CampaignProposerSummary {
  created: boolean;
  campaignId: string | null;
  skippedReason: string | null;
}

export type AgentRunResult<T> =
  | { status: 'ran'; summary: T }
  | { status: 'disabled' }
  | { status: 'not_scheduled_today' }
  | { status: 'failed'; error: string };

export interface AgentDispatchSummary {
  leadTriage: AgentRunResult<LeadTriageSummary>;
  collections: AgentRunResult<CollectionsSummary>;
  execDigest: AgentRunResult<ExecDigestSummary>;
  campaignProposer: AgentRunResult<CampaignProposerSummary>;
}
