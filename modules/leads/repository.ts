import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { CreateLeadInput } from '@/modules/leads/types';

type LeadRow = Database['public']['Tables']['leads']['Row'];

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
