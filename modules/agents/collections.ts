// Collections agent (Agentic layer, 2026-09-03).
//
// Reads the receivables picture — outstanding balances, broken payment
// promises captured by the voice agent, pending installments — and drafts the
// right chase per debtor. V1 is DELIBERATELY drafts-and-escalations only: a
// collections message is the riskiest kind of message a business sends, so
// every draft lands on the debtor's lead as an agent_suggestion (due now in
// /follow-up) and a human presses send using the existing lead send tools.
import * as leadsService from '@/modules/leads/service';
import * as leadsRepository from '@/modules/leads/repository';
import * as agentsRepository from '@/modules/agents/repository';
import { runJsonAgent } from '@/modules/agents/model';
import type { CollectionsSummary } from '@/modules/agents/types';

const MAX_DEBTORS_PER_RUN = 25;
const SUGGESTION_COOLDOWN_DAYS = 7;

interface CollectionsDecision {
  registrationId: string;
  action: 'draft_sms' | 'draft_email' | 'suggest_call' | 'escalate' | 'leave';
  reason: string;
  message?: string;
}

function promptFor(debtors: agentsRepository.OutstandingDebtor[]): string {
  const blocks = debtors
    .map(
      (debtor) =>
        `<debtor registrationId="${debtor.registrationId}">\n` +
        `Name: ${debtor.participantName} | Course: ${debtor.courseName} (${debtor.cohortLabel}, starts ${debtor.batchStartDate})\n` +
        `Fee GHS ${debtor.courseFee} | Paid GHS ${debtor.amountPaid} | Balance GHS ${debtor.balance} | Status: ${debtor.paymentStatus}` +
        (debtor.brokenPromiseDate ? `\nPromised to pay by ${debtor.brokenPromiseDate} — date has passed.` : '') +
        (debtor.installmentDueDate ? `\nPayment-plan installment due ${debtor.installmentDueDate}.` : '') +
        `\n</debtor>`,
    )
    .join('\n\n');

  return `You are the collections agent for Knowsia, a Ghanaian professional-training company. Automated payment reminders already go out on a fixed schedule; your job is the judgment layer on top: which debtors deserve a PERSONAL touch today, and what should it say?

Ghanaian context: firm but warm and face-saving; WhatsApp/SMS preferred; payment plans exist; part-payers are engaged customers, not delinquents.

Per debtor, ONE action:
- "draft_sms": a personal SMS/WhatsApp message (under 300 characters, uses their first name, references their specific situation — e.g. the promise date, the part-payment already made, the course start date). No placeholders.
- "draft_email": same but email-length (under 800 characters), for larger balances or formal cases.
- "suggest_call": a broken promise or a large stale balance where a conversation beats a message.
- "escalate": something looks wrong (e.g. paid amount near fee but status not Paid) — a human should look before anyone is chased.
- "leave": recently engaged, or the scheduled reminders are enough for now.

Reply with ONLY a JSON array:
[{"registrationId": "...", "action": "...", "reason": "one sentence", "message": "..."}]

${blocks}`;
}

export async function runCollectionsAgent(): Promise<CollectionsSummary> {
  const summary: CollectionsSummary = {
    evaluated: 0, drafts: 0, escalations: 0, noLeadRow: 0,
    skippedCooldown: 0, errors: [],
  };

  const debtors = await agentsRepository.selectOutstandingDebtors(MAX_DEBTORS_PER_RUN * 2);
  if (debtors.length === 0) return summary;

  // Resolve each debtor to a lead (the agent's only writing surface) and
  // apply the suggestion cooldown before spending model tokens.
  const recentlySuggested = await leadsService.recentAgentSuggestionLeadIdsSystem(
    SUGGESTION_COOLDOWN_DAYS,
  );
  const withLeads: Array<{ debtor: agentsRepository.OutstandingDebtor; leadId: string }> = [];
  for (const debtor of debtors) {
    const lead = await leadsRepository.selectLeadByRegistrationId(debtor.registrationId);
    if (!lead) {
      summary.noLeadRow += 1;
      continue;
    }
    if (recentlySuggested.has(lead.id)) {
      summary.skippedCooldown += 1;
      continue;
    }
    withLeads.push({ debtor, leadId: lead.id });
    if (withLeads.length >= MAX_DEBTORS_PER_RUN) break;
  }
  if (withLeads.length === 0) return summary;

  summary.evaluated = withLeads.length;
  const decisions = await runJsonAgent<CollectionsDecision[]>(
    promptFor(withLeads.map((entry) => entry.debtor)),
    { maxTokens: 6000 },
  );
  const leadByRegistration = new Map(withLeads.map((entry) => [entry.debtor.registrationId, entry.leadId]));

  for (const decision of Array.isArray(decisions) ? decisions : []) {
    const leadId = leadByRegistration.get(decision.registrationId);
    if (!leadId) continue; // invented id — no-op
    try {
      switch (decision.action) {
        case 'draft_sms':
        case 'draft_email':
          await leadsService.recordAgentSuggestionSystem(
            leadId,
            `Collections draft (${decision.action === 'draft_sms' ? 'SMS' : 'email'}): ` +
              `"${(decision.message ?? '').slice(0, 900)}" — ${decision.reason}`,
          );
          summary.drafts += 1;
          break;
        case 'suggest_call':
          await leadsService.recordAgentSuggestionSystem(
            leadId,
            `Collections: recommends a phone call — ${decision.reason}`,
          );
          summary.drafts += 1;
          break;
        case 'escalate':
          await leadsService.recordAgentSuggestionSystem(
            leadId,
            `Collections ESCALATION — needs a human look before any chase: ${decision.reason}`,
          );
          summary.escalations += 1;
          break;
        default:
          break; // 'leave'
      }
    } catch (err) {
      summary.errors.push(`${decision.registrationId}: ${String(err).slice(0, 200)}`);
    }
  }
  return summary;
}
