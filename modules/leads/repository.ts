import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type {
  CreateLeadAssignmentRuleInput,
  CreateLeadInput,
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

export async function selectLeads(): Promise<LeadRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

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

