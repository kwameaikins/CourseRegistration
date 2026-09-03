// Lead triage agent (Agentic layer, 2026-09-03) — Doc 13 Phase 3's "lead
// qualification agent", built on the Revenue OS data: reads each open lead's
// full timeline nightly and decides what should happen next.
//
// Autonomy boundary, deliberately narrow at launch:
//   WRITE-DIRECT (bounded): schedule a follow-up (1–30 days), adjust a score
//     (±15, clamped in leads service, reason on the timeline).
//   SUGGEST ONLY: drafted messages, call recommendations, "consider Lost" —
//     recorded as agent_suggestion activities surfacing in /follow-up.
//   NEVER: send anything, change a status, touch money.
import * as leadsService from '@/modules/leads/service';
import { runJsonAgent } from '@/modules/agents/model';
import type { LeadTriageSummary } from '@/modules/agents/types';

const MAX_LEADS_PER_RUN = 30;
const SUGGESTION_COOLDOWN_DAYS = 7;
const OPEN_STATUSES = ['New', 'Qualified', 'Follow-up'] as const;

// Autonomy tier 1 (2026-09-03): with AGENT_LEAD_TRIAGE_AUTOSEND=true, the
// agent may SEND its drafted SMS itself — but only to the "nothing to lose"
// class, and only within these bounds. Everything outside the bounds falls
// back to a suggestion for a human. Promotion criterion for widening this
// class: the measured unedited-send rate in /follow-up plus conversion
// parity — never a vibe.
const MAX_AUTOSEND_PER_RUN = 10;
const AUTOSEND_MAX_SCORE = 39; // Cold band only
const AUTOSEND_MIN_STALE_DAYS = 14; // untouched this long
const AUTOSEND_MIN_CHARS = 20;
const AUTOSEND_MAX_CHARS = 320;

function autosendEnabled(): boolean {
  return process.env.AGENT_LEAD_TRIAGE_AUTOSEND === 'true';
}

interface TriageDecision {
  leadId: string;
  action: 'suggest_message' | 'schedule_follow_up' | 'suggest_lost' | 'suggest_call' | 'leave';
  reason: string;
  draftMessage?: string;
  nextFollowUpDays?: number;
  scoreAdjustment?: number;
}

function promptFor(
  leads: Array<{
    id: string;
    profile: string;
    timeline: string[];
  }>,
): string {
  const blocks = leads
    .map(
      (lead) =>
        `<lead id="${lead.id}">\n${lead.profile}\nRecent timeline (newest first):\n${
          lead.timeline.map((line) => `- ${line}`).join('\n') || '- (no activity yet)'
        }\n</lead>`,
    )
    .join('\n\n');

  return `You are the sales triage agent for Knowsia, a Ghanaian professional-training company (live online evening courses for accountants and finance professionals; payment plans available; WhatsApp is the dominant channel).

For EACH lead below, decide ONE next action. You are advising a human salesperson, not acting yourself. Judge from the timeline: how warm is this person, what was last said, what would a good salesperson do next?

Actions:
- "suggest_message": draft a short, warm, specific WhatsApp/SMS-style message (under 300 characters, no placeholders) the salesperson can send as-is. Use for leads worth a touch now.
- "schedule_follow_up": nothing to say today, but set a revisit in nextFollowUpDays (1-30). Use for leads with a stated future timing.
- "suggest_call": the situation needs a live conversation (confusion, objection, big-ticket hesitation).
- "suggest_lost": clearly dead (explicit no, long silence after several touches). The human decides; you only recommend.
- "leave": recently contacted or already properly scheduled — do nothing.

Optionally include scoreAdjustment (-15..15) with the reason when the timeline shows the current score is clearly wrong in either direction.

Reply with ONLY a JSON array, one object per lead:
[{"leadId": "...", "action": "...", "reason": "one sentence", "draftMessage": "...", "nextFollowUpDays": 3, "scoreAdjustment": 0}]

${blocks}`;
}

export async function runLeadTriageAgent(): Promise<LeadTriageSummary> {
  const summary: LeadTriageSummary = {
    evaluated: 0, suggestions: 0, followUpsScheduled: 0, scoresAdjusted: 0,
    autoSent: 0, skippedCooldown: 0, errors: [],
  };

  const allLeads = await leadsService.listLeads();
  const recentlySuggested = await leadsService.recentAgentSuggestionLeadIdsSystem(
    SUGGESTION_COOLDOWN_DAYS,
  );
  const open = allLeads.filter((lead) =>
    (OPEN_STATUSES as readonly string[]).includes(lead.status),
  );
  const eligible = open.filter((lead) => {
    if (recentlySuggested.has(lead.id)) {
      summary.skippedCooldown += 1;
      return false;
    }
    return true;
  });
  const batch = eligible.slice(0, MAX_LEADS_PER_RUN);
  if (batch.length === 0) return summary;

  // Kept alongside the prompt blocks: the auto-send eligibility check needs
  // the raw lead + how long it has sat untouched.
  const infoById = new Map<string, { score: number; staleDays: number }>();

  const enriched = await Promise.all(
    batch.map(async (lead) => {
      const { activities } = await leadsService.getLeadWithActivities(lead.id);
      const lastTouch = activities[0]?.createdAt ?? lead.createdAt;
      infoById.set(lead.id, {
        score: lead.score,
        staleDays: Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86_400_000),
      });
      return {
        id: lead.id,
        profile:
          `Name: ${lead.fullName} | Status: ${lead.status} | Score: ${lead.score} | ` +
          `Source: ${lead.leadSource}` +
          (lead.company ? ` | Company: ${lead.company}` : '') +
          (lead.attribution?.utm_campaign ? ` | Campaign: ${lead.attribution.utm_campaign}` : '') +
          (lead.nextFollowUpAt ? ` | Follow-up scheduled: ${lead.nextFollowUpAt.slice(0, 10)}` : '') +
          (lead.notes ? `\nNotes: ${lead.notes.slice(0, 300)}` : ''),
        timeline: activities
          .slice(0, 8)
          .map((activity) => `${activity.createdAt.slice(0, 10)} ${activity.activityType}: ${activity.description.slice(0, 200)}`),
      };
    }),
  );

  summary.evaluated = batch.length;
  const decisions = await runJsonAgent<TriageDecision[]>(promptFor(enriched), {
    maxTokens: 6000,
  });
  const validIds = new Set(batch.map((lead) => lead.id));

  for (const decision of Array.isArray(decisions) ? decisions : []) {
    // The model can only act on leads it was shown — an invented id is a no-op.
    if (!validIds.has(decision.leadId)) continue;
    try {
      if (
        typeof decision.scoreAdjustment === 'number' &&
        decision.scoreAdjustment !== 0
      ) {
        await leadsService.applyAgentScoreAdjustmentSystem(
          decision.leadId,
          decision.scoreAdjustment,
          decision.reason ?? 'triage agent',
        );
        summary.scoresAdjusted += 1;
      }

      switch (decision.action) {
        case 'schedule_follow_up':
          await leadsService.scheduleAgentFollowUpSystem(
            decision.leadId,
            decision.nextFollowUpDays ?? 3,
            decision.reason ?? 'triage agent',
          );
          summary.followUpsScheduled += 1;
          break;
        case 'suggest_message': {
          const draft = (decision.draftMessage ?? '').trim();
          const info = infoById.get(decision.leadId);
          const eligibleForAutosend =
            autosendEnabled() &&
            summary.autoSent < MAX_AUTOSEND_PER_RUN &&
            info !== undefined &&
            info.score <= AUTOSEND_MAX_SCORE &&
            info.staleDays >= AUTOSEND_MIN_STALE_DAYS &&
            draft.length >= AUTOSEND_MIN_CHARS &&
            draft.length <= AUTOSEND_MAX_CHARS;

          if (eligibleForAutosend) {
            // Opt-outs and missing phones are enforced inside the send; any
            // skip falls back to a human suggestion rather than vanishing.
            const outcome = await leadsService.sendAgentSmsSystem(
              decision.leadId, draft, 'auto', null,
            );
            if (outcome === 'sent') {
              summary.autoSent += 1;
              break;
            }
          }
          await leadsService.recordAgentSuggestionSystem(
            decision.leadId,
            `Suggested message: "${draft.slice(0, 400)}" — ${decision.reason}`,
          );
          summary.suggestions += 1;
          break;
        }
        case 'suggest_call':
          await leadsService.recordAgentSuggestionSystem(
            decision.leadId,
            `Recommends a phone call — ${decision.reason}`,
          );
          summary.suggestions += 1;
          break;
        case 'suggest_lost':
          await leadsService.recordAgentSuggestionSystem(
            decision.leadId,
            `Consider marking Lost — ${decision.reason}`,
          );
          summary.suggestions += 1;
          break;
        default:
          break; // 'leave'
      }
    } catch (err) {
      summary.errors.push(`${decision.leadId}: ${String(err).slice(0, 200)}`);
    }
  }
  return summary;
}
