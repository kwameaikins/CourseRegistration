import { timestampBounds } from '@/lib/date-range';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type {
  CreateLeadAssignmentRuleInput,
  CreateLeadInput,
  ListLeadsFilters,
  UpdateLeadAssignmentRuleInput,
} from '@/modules/leads/types';

type LeadRow = Database['public']['Tables']['leads']['Row'];
type LeadActivityRow = Database['public']['Tables']['lead_activities']['Row'];
type LeadAssignmentRuleRow = Database['public']['Tables']['lead_assignment_rules']['Row'];

export async function insertLead(input: CreateLeadInput): Promise<LeadRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .insert({
      registration_id: input.registrationId ?? null,
      participant_id: input.participantId ?? null,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      job_title: input.jobTitle ?? null,
      company: input.company ?? null,
      lead_source: input.leadSource,
      status: input.status,
      score: input.score,
      assigned_to: input.assignedTo ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Server-side filtering (replaces "fetch everything, filter in the
// browser") — a sane cap, not full pagination infrastructure, since this
// business's lead volume doesn't warrant it yet.
const LEADS_QUERY_LIMIT = 500;

export async function selectLeads(filters: ListLeadsFilters = {}): Promise<LeadRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase.from('leads').select('*');

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.leadSource) query = query.eq('lead_source', filters.leadSource);
  if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
  if (filters.dueForFollowUp) {
    query = query.not('next_follow_up_at', 'is', null).lte('next_follow_up_at', new Date().toISOString());
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(
      `full_name.ilike.${term},email.ilike.${term},company.ilike.${term}`,
    );
  }
  // Applied here rather than in the browser precisely because of the
  // LEADS_QUERY_LIMIT cap below: filtering after the cap would only ever
  // search the newest 500 leads, so an older date range would look empty.
  const bounds = timestampBounds(filters);
  if (bounds.gte) query = query.gte('created_at', bounds.gte);
  if (bounds.lte) query = query.lte('created_at', bounds.lte);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(LEADS_QUERY_LIMIT);

  if (error) throw error;
  return data ?? [];
}

export async function selectLeadById(id: string): Promise<LeadRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Dedup lookup (closes the "same person registers twice" gap) — email is
// already lowercased by createLeadInputSchema, so a plain eq is enough.
export async function selectLeadByEmail(email: string): Promise<LeadRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function selectLeadByRegistrationId(registrationId: string): Promise<LeadRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// The first real query against leads_next_follow_up_at_idx — every prior
// consumer (UI, agent tool) fetched the whole table and filtered in memory.
export async function selectLeadsDueForFollowUp(nowIso: string): Promise<LeadRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('next_follow_up_at', 'is', null)
    .lte('next_follow_up_at', nowIso)
    .order('next_follow_up_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function selectUnassignedLeadsByLeadSource(leadSource: string): Promise<LeadRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .ilike('lead_source', leadSource)
    .is('assigned_to', null);

  if (error) throw error;
  return data ?? [];
}

export async function updateLead(id: string, changes: Partial<LeadRow>): Promise<LeadRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function insertLeadActivity(input: {
  lead_id: string;
  activity_type: LeadActivityRow['activity_type'];
  description: string;
  performed_by: string | null;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('lead_activities').insert(input);
  if (error) throw error;
}

export async function selectLeadActivities(leadId: string): Promise<LeadActivityRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Small, single-purpose lookup so activity descriptions can name the
// assigned staff member without going through usersService (which gates
// staff listing to admin-only — this read is unrelated to that permission).
export async function selectStaffFullName(staffId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('staff_users')
    .select('full_name')
    .eq('id', staffId)
    .maybeSingle();

  if (error) throw error;
  return data?.full_name ?? null;
}

// Same narrow-lookup posture as selectStaffFullName, but also carrying
// email — used only by the follow-up nudge dispatch to know where to send.
export async function selectStaffContact(
  staffId: string,
): Promise<{ fullName: string; email: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('staff_users')
    .select('full_name, email')
    .eq('id', staffId)
    .maybeSingle();

  if (error) throw error;
  return data ? { fullName: data.full_name, email: data.email } : null;
}

// Lead assignment rules (Revenue OS Phase 2 roadmap item).
export async function selectActiveAssignmentRuleByLeadSource(
  leadSource: string,
): Promise<LeadAssignmentRuleRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('lead_assignment_rules')
    .select('*')
    .ilike('lead_source', leadSource)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function selectAssignmentRules(): Promise<LeadAssignmentRuleRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('lead_assignment_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function selectAssignmentRuleById(id: string): Promise<LeadAssignmentRuleRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('lead_assignment_rules')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertAssignmentRule(
  input: CreateLeadAssignmentRuleInput,
): Promise<LeadAssignmentRuleRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('lead_assignment_rules')
    .insert({ lead_source: input.leadSource, assigned_to: input.assignedTo })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateAssignmentRule(
  id: string,
  changes: UpdateLeadAssignmentRuleInput,
): Promise<LeadAssignmentRuleRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('lead_assignment_rules')
    .update({
      ...(changes.assignedTo !== undefined ? { assigned_to: changes.assignedTo } : {}),
      ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
