import { sendTransactionalEmail } from '@/lib/resend/client';
import { AppError } from '@/lib/errors';
import * as leadsRepository from '@/modules/leads/repository';
import type {
  CreateLeadAssignmentRuleInput,
  CreateLeadInput,
  Lead,
  LeadActivity,
  LeadAssignmentRule,
  ListLeadsFilters,
  UpdateLeadAssignmentRuleInput,
  UpdateLeadInput,
} from '@/modules/leads/types';
import { createLeadInputSchema, updateLeadInputSchema } from '@/modules/leads/types';
import type { Database } from '@/lib/supabase/database.types';

type LeadRow = Database['public']['Tables']['leads']['Row'];
type LeadActivityRow = Database['public']['Tables']['lead_activities']['Row'];
type LeadAssignmentRuleRow = Database['public']['Tables']['lead_assignment_rules']['Row'];

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

// The repository only ever deals in raw snake_case DB rows; everything this
// service hands back to routes/UI must be the camelCase domain shape
// instead (same convention as modules/payments/service.ts's toPayment).
function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    registrationId: row.registration_id,
    participantId: row.participant_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    company: row.company,
    leadSource: row.lead_source as Lead['leadSource'],
    status: row.status as Lead['status'],
    score: row.score,
    assignedTo: row.assigned_to,
    notes: row.notes,
    nextFollowUpAt: row.next_follow_up_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLeadActivity(row: LeadActivityRow): LeadActivity {
  return {
    id: row.id,
    leadId: row.lead_id,
    activityType: row.activity_type as LeadActivity['activityType'],
    description: row.description,
    performedBy: row.performed_by,
    createdAt: row.created_at,
  };
}

function toAssignmentRule(row: LeadAssignmentRuleRow): LeadAssignmentRule {
  return {
    id: row.id,
    leadSource: row.lead_source,
    assignedTo: row.assigned_to,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Lead source channels ranked by how likely they are to convert, per the
// founders' informal read of past intake data (referrals and LinkedIn
// professionals convert best; Facebook/organic traffic is the coldest).
// Unlisted/unknown sources score 0 for this component.
const LEAD_SOURCE_WEIGHTS: Record<string, number> = {
  Referral: 30,
  LinkedIn: 20,
  Website: 15,
  WhatsApp: 10,
  Facebook: 5,
};

// A registrant who typed "N/A" (the form's own suggested placeholder for
// "not applicable") hasn't actually told us anything — treat it the same as
// a blank field rather than rewarding it as a present value.
function isMeaningfulValue(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0 && value.trim().toLowerCase() !== 'n/a';
}

// Automatic lead score (Phase 1 Revenue OS roadmap): a lightweight,
// explainable heuristic from signals already available at lead-creation
// time — no external data or ML involved. Staff can always override the
// result afterwards via the leads page's score field. Capped at 100.
export function calculateLeadScore(input: {
  jobTitle?: string | null;
  company?: string | null;
  leadSource: string;
}): number {
  let score = 10; // base score — every captured lead has some value.
  if (isMeaningfulValue(input.jobTitle)) score += 20;
  if (isMeaningfulValue(input.company)) score += 15;
  score += LEAD_SOURCE_WEIGHTS[input.leadSource] ?? 0;
  return Math.min(score, 100);
}

// Activity logging is a side effect of the primary lead write, never the
// other way around (same non-blocking posture as email/WhatsApp/SMS —
// P4.01): a logging failure must never sink lead creation/updates.
async function logActivity(
  leadId: string,
  activityType: LeadActivity['activityType'],
  description: string,
  performedBy: string | null,
): Promise<void> {
  try {
    await leadsRepository.insertLeadActivity({
      lead_id: leadId,
      activity_type: activityType,
      description,
      performed_by: performedBy,
    });
  } catch (err) {
    console.error('[leads activity log]', err);
  }
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  try {
    const parsed = createLeadInputSchema.parse(input);

    // Dedup (closes a real gap: the same person registering twice used to
    // create a second, disconnected lead row with no link between them).
    // Only ever raises the score, never lowers it — a duplicate intake must
    // not undo a staff member's manual judgment call on an existing lead.
    const existing = await leadsRepository.selectLeadByEmail(parsed.email);
    if (existing) {
      const recalculated = calculateLeadScore(parsed);
      const changes: Partial<LeadRow> = {};
      if (!existing.registration_id && parsed.registrationId) {
        changes.registration_id = parsed.registrationId;
      }
      if (!existing.participant_id && parsed.participantId) {
        changes.participant_id = parsed.participantId;
      }
      if (recalculated > existing.score) {
        changes.score = recalculated;
      }
      const merged =
        Object.keys(changes).length > 0
          ? await leadsRepository.updateLead(existing.id, changes)
          : existing;
      await logActivity(
        existing.id,
        'duplicate_merged',
        `Another intake from ${parsed.leadSource} matched this lead by email — merged instead of creating a duplicate.`,
        null,
      );
      return toLead(merged);
    }

    const score = parsed.score ?? calculateLeadScore(parsed);

    // Lead assignment rules (Phase 2 roadmap item): only auto-route when the
    // caller didn't already specify an assignee — an explicit assignedTo
    // (e.g. staff manually creating a lead for themselves) always wins.
    let assignedTo = parsed.assignedTo ?? null;
    let autoAssignedRule: LeadAssignmentRuleRow | null = null;
    if (!assignedTo) {
      autoAssignedRule = await leadsRepository.selectActiveAssignmentRuleByLeadSource(
        parsed.leadSource,
      );
      if (autoAssignedRule) assignedTo = autoAssignedRule.assigned_to;
    }

    const lead = await leadsRepository.insertLead({ ...parsed, score, assignedTo });
    await logActivity(lead.id, 'created', `Lead captured from ${parsed.leadSource}.`, null);
    if (autoAssignedRule) {
      const staffName = await leadsRepository.selectStaffFullName(autoAssignedRule.assigned_to);
      await logActivity(
        lead.id,
        'assigned',
        `Auto-assigned to ${staffName ?? 'a staff member'} (${parsed.leadSource} rule).`,
        null,
      );
    }
    return toLead(lead);
  } catch (err) {
    console.error('[leads createLead]', err);
    if (err instanceof AppError) throw err;
    throw new AppError('LEAD_CREATE_FAILED', 'Unable to create lead right now.', 500);
  }
}

export async function listLeads(filters: ListLeadsFilters = {}): Promise<Lead[]> {
  const rows = await leadsRepository.selectLeads(filters);
  return rows.map(toLead);
}

export async function getLeadById(id: string): Promise<Lead> {
  const lead = await leadsRepository.selectLeadById(id);
  if (!lead) {
    throw new AppError('NOT_FOUND', 'Lead not found.', 404);
  }
  return toLead(lead);
}

// Lead detail view (Phase 1 Revenue OS roadmap): the current record plus
// its full activity timeline, newest first.
export async function getLeadWithActivities(
  id: string,
): Promise<{ lead: Lead; activities: LeadActivity[] }> {
  const lead = await getLeadById(id);
  const activityRows = await leadsRepository.selectLeadActivities(id);
  return { lead, activities: activityRows.map(toLeadActivity) };
}

export async function getPipelineSummary() {
  const leads = await leadsRepository.selectLeads();
  const byStatus: Record<string, number> = {};
  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
  }
  const averageScore =
    leads.length > 0
      ? Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length)
      : 0;
  return {
    total: leads.length,
    byStatus,
    averageScore,
    unassigned: leads.filter((lead) => !lead.assigned_to).length,
  };
}

// The single definition of "due" — the leads page and the
// list_leads_due_for_follow_up agent tool both used to independently
// re-derive this in memory over a full-table fetch; runFollowUpDispatch
// (the cron path) now shares it too.
export async function listLeadsDueForFollowUp(): Promise<Lead[]> {
  const rows = await leadsRepository.selectLeadsDueForFollowUp(new Date().toISOString());
  return rows.map(toLead);
}

function suggestedFollowUpLine(lead: Lead): string {
  if (lead.status === 'New') {
    return "Introduce yourself, confirm they got the information they needed, and ask if they have questions.";
  }
  if (lead.status === 'Qualified') {
    return 'Share course dates and fees, and ask what would help them decide to register.';
  }
  if (lead.status === 'Follow-up') {
    return "Check back in — see if anything is still holding them back from registering.";
  }
  return 'Check in and see how things are going.';
}

// Proactive follow-up nudge (bundled into the existing daily reminders cron
// — Vercel Hobby caps cron jobs at two, both already taken by reminders and
// attendance). Deliberately a templated message, not a live per-lead LLM
// call: unbounded daily Claude spend for every due lead isn't warranted for
// a $0/month-default project, and the admin can always ask the Assistant
// chat to draft a better one for a specific lead. Every send is
// independently try/caught so one failure never blocks the rest.
export async function runFollowUpDispatch(
  now: Date = new Date(),
): Promise<{ notified: number; skipped: number; errors: string[] }> {
  const rows = await leadsRepository.selectLeadsDueForFollowUp(now.toISOString());
  const summary = { notified: 0, skipped: 0, errors: [] as string[] };

  for (const row of rows) {
    const lead = toLead(row);
    try {
      const recipient = lead.assignedTo
        ? await leadsRepository.selectStaffContact(lead.assignedTo)
        : null;
      const toEmail = recipient?.email ?? process.env.LEADS_FALLBACK_NOTIFY_EMAIL;
      if (!toEmail) {
        summary.skipped += 1;
        continue;
      }
      await sendTransactionalEmail({
        to: toEmail,
        subject: `Follow-up due: ${lead.fullName}`,
        html: `
<p>Dear ${recipient?.fullName ?? 'team'},</p>
<p>A follow-up is due for <strong>${lead.fullName}</strong> (${lead.leadSource}, status: ${lead.status}, score: ${lead.score}).</p>
<p>Suggested next step: ${suggestedFollowUpLine(lead)}</p>
<p><a href="${APP_URL()}/leads">Open the Leads screen</a> to update or clear this follow-up.</p>`,
      });
      summary.notified += 1;
    } catch (err) {
      summary.errors.push(`${lead.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}

// Bridges payment success back to the lead record (closes a real gap: a
// lead never used to become "Enrolled" even after its registration was
// fully paid). Called non-blockingly from payments/service.ts, same
// posture as opportunitiesService.markWonByRegistrationId right next to it.
// Silently no-ops when no lead exists for the registration (e.g. it came
// through the waitlist path before lead creation was wired there too, or
// the original best-effort lead creation failed) or when the lead is
// already in a terminal state.
export async function markEnrolledByRegistrationId(registrationId: string): Promise<void> {
  const lead = await leadsRepository.selectLeadByRegistrationId(registrationId);
  if (!lead || lead.status === 'Enrolled' || lead.status === 'Lost') return;

  const previousStatus = lead.status;
  await leadsRepository.updateLead(lead.id, {
    status: 'Enrolled',
    score: Math.min(lead.score + 25, 100),
  });
  await logActivity(
    lead.id,
    'status_changed',
    `Status changed from "${previousStatus}" to "Enrolled" automatically — payment received.`,
    null,
  );
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
  performedBy: string | null = null,
): Promise<Lead> {
  if (!id) {
    throw new AppError('VALIDATION_ERROR', 'Lead id is required.', 400);
  }

  const parsedInput = updateLeadInputSchema.parse(input);

  const existing = await leadsRepository.selectLeadById(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Lead not found.', 404);
  }

  const changes: Record<string, string | number | null> = {};
  if (parsedInput.status !== undefined) changes.status = parsedInput.status;
  if (parsedInput.notes !== undefined) changes.notes = parsedInput.notes;
  if (parsedInput.assignedTo !== undefined) changes.assigned_to = parsedInput.assignedTo;
  if (parsedInput.score !== undefined) changes.score = parsedInput.score;
  if (parsedInput.nextFollowUpAt !== undefined) changes.next_follow_up_at = parsedInput.nextFollowUpAt;

  const updated = await leadsRepository.updateLead(id, changes);

  if (parsedInput.status !== undefined && parsedInput.status !== existing.status) {
    await logActivity(
      id,
      'status_changed',
      `Status changed from "${existing.status}" to "${updated.status}".`,
      performedBy,
    );
  }
  if (parsedInput.assignedTo !== undefined && parsedInput.assignedTo !== existing.assigned_to) {
    if (updated.assigned_to) {
      const staffName = await leadsRepository.selectStaffFullName(updated.assigned_to).catch(() => null);
      await logActivity(id, 'assigned', `Assigned to ${staffName ?? 'a staff member'}.`, performedBy);
    } else {
      await logActivity(id, 'unassigned', 'Unassigned.', performedBy);
    }
  }
  if (parsedInput.score !== undefined && parsedInput.score !== existing.score) {
    await logActivity(
      id,
      'score_changed',
      `Score changed from ${existing.score} to ${updated.score}.`,
      performedBy,
    );
  }
  if (parsedInput.notes !== undefined && parsedInput.notes !== existing.notes) {
    // Carries the actual note text into the timeline (previously just
    // logged "Note updated." with no content) — since the notes column
    // itself is last-write-wins, the activity log is the only place a
    // note's history survives.
    await logActivity(
      id,
      'note_updated',
      parsedInput.notes ? `Note: ${parsedInput.notes}` : 'Note cleared.',
      performedBy,
    );
  }
  if (
    parsedInput.nextFollowUpAt !== undefined &&
    parsedInput.nextFollowUpAt !== existing.next_follow_up_at
  ) {
    const description = updated.next_follow_up_at
      ? `Follow-up scheduled for ${new Date(updated.next_follow_up_at).toLocaleDateString()}.`
      : 'Follow-up reminder cleared.';
    await logActivity(id, 'follow_up_scheduled', description, performedBy);
  }

  return toLead(updated);
}

// Lead assignment rules (Phase 2 roadmap item) — admin-managed routing
// config; enforcement of the admin-only write happens in the API routes,
// same pattern as every other admin-gated write in this codebase.
export async function listAssignmentRules(): Promise<LeadAssignmentRule[]> {
  const rows = await leadsRepository.selectAssignmentRules();
  return rows.map(toAssignmentRule);
}

export async function createAssignmentRule(
  input: CreateLeadAssignmentRuleInput,
): Promise<LeadAssignmentRule> {
  const row = await leadsRepository.insertAssignmentRule(input);
  return toAssignmentRule(row);
}

export async function updateAssignmentRule(
  id: string,
  input: UpdateLeadAssignmentRuleInput,
): Promise<LeadAssignmentRule> {
  const row = await leadsRepository.updateAssignmentRule(id, input);
  return toAssignmentRule(row);
}

// Explicit, staff-triggered bulk action (matches this codebase's established
// pattern of visible bulk actions rather than silent background
// reassignment) — applies an active rule to leads that are STILL
// unassigned, never touching a lead someone already claimed.
export async function backfillAssignmentRule(ruleId: string): Promise<{ assignedCount: number }> {
  const rule = await leadsRepository.selectAssignmentRuleById(ruleId);
  if (!rule) {
    throw new AppError('NOT_FOUND', 'Assignment rule not found.', 404);
  }
  if (!rule.is_active) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only an active rule can be applied to existing leads.',
      400,
    );
  }

  const unassigned = await leadsRepository.selectUnassignedLeadsByLeadSource(rule.lead_source);
  const staffName = await leadsRepository.selectStaffFullName(rule.assigned_to);

  for (const lead of unassigned) {
    await leadsRepository.updateLead(lead.id, { assigned_to: rule.assigned_to });
    await logActivity(
      lead.id,
      'assigned',
      `Assigned to ${staffName ?? 'a staff member'} (${rule.lead_source} rule, applied to existing leads).`,
      null,
    );
  }

  return { assignedCount: unassigned.length };
}
