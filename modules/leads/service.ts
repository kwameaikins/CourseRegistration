import { AppError } from '@/lib/errors';
import * as leadsRepository from '@/modules/leads/repository';
import type {
  CreateLeadAssignmentRuleInput,
  CreateLeadInput,
  Lead,
  LeadActivity,
  LeadAssignmentRule,
  UpdateLeadAssignmentRuleInput,
} from '@/modules/leads/types';
import { createLeadInputSchema } from '@/modules/leads/types';
import type { Database } from '@/lib/supabase/database.types';

type LeadRow = Database['public']['Tables']['leads']['Row'];
type LeadActivityRow = Database['public']['Tables']['lead_activities']['Row'];
type LeadAssignmentRuleRow = Database['public']['Tables']['lead_assignment_rules']['Row'];

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
    leadSource: row.lead_source,
    status: row.status,
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

export async function listLeads(): Promise<Lead[]> {
  const rows = await leadsRepository.selectLeads();
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

export async function updateLead(
  id: string,
  input: {
    status?: string;
    notes?: string | null;
    assignedTo?: string | null;
    score?: number;
    nextFollowUpAt?: string | null;
  },
  performedBy: string | null = null,
): Promise<Lead> {
  if (!id) {
    throw new AppError('VALIDATION_ERROR', 'Lead id is required.', 400);
  }

  const existing = await leadsRepository.selectLeadById(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Lead not found.', 404);
  }

  const changes: Record<string, string | number | null> = {};
  if (input.status !== undefined) changes.status = input.status;
  if (input.notes !== undefined) changes.notes = input.notes;
  if (input.assignedTo !== undefined) changes.assigned_to = input.assignedTo;
  if (input.score !== undefined) changes.score = input.score;
  if (input.nextFollowUpAt !== undefined) changes.next_follow_up_at = input.nextFollowUpAt;

  const updated = await leadsRepository.updateLead(id, changes);

  if (input.status !== undefined && input.status !== existing.status) {
    await logActivity(
      id,
      'status_changed',
      `Status changed from "${existing.status}" to "${updated.status}".`,
      performedBy,
    );
  }
  if (input.assignedTo !== undefined && input.assignedTo !== existing.assigned_to) {
    if (updated.assigned_to) {
      const staffName = await leadsRepository.selectStaffFullName(updated.assigned_to).catch(() => null);
      await logActivity(id, 'assigned', `Assigned to ${staffName ?? 'a staff member'}.`, performedBy);
    } else {
      await logActivity(id, 'unassigned', 'Unassigned.', performedBy);
    }
  }
  if (input.score !== undefined && input.score !== existing.score) {
    await logActivity(
      id,
      'score_changed',
      `Score changed from ${existing.score} to ${updated.score}.`,
      performedBy,
    );
  }
  if (input.notes !== undefined && input.notes !== existing.notes) {
    await logActivity(id, 'note_updated', 'Note updated.', performedBy);
  }
  if (
    input.nextFollowUpAt !== undefined &&
    input.nextFollowUpAt !== existing.next_follow_up_at
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
