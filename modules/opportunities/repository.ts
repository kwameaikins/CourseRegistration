import { timestampBounds } from '@/lib/date-range';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { CreateOpportunityInput } from '@/modules/opportunities/types';

type OpportunityRow = Database['public']['Tables']['opportunities']['Row'];

export async function insertOpportunity(input: CreateOpportunityInput): Promise<OpportunityRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      lead_id: input.leadId ?? null,
      registration_id: input.registrationId ?? null,
      course_name: input.courseName,
      batch_label: input.batchLabel,
      amount: input.amount,
      stage: input.stage,
      expected_close_date: input.expectedCloseDate ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function selectOpportunities(
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<OpportunityRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase.from('opportunities').select('*');
  // This read is currently uncapped, so a browser-side filter would work
  // today — done in the query anyway so it keeps working when a cap is added,
  // and so the list and summary paths share one definition of the range.
  const bounds = timestampBounds(range);
  if (bounds.gte) query = query.gte('created_at', bounds.gte);
  if (bounds.lte) query = query.lte('created_at', bounds.lte);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function selectOpportunityById(id: string): Promise<OpportunityRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function selectOpportunityByRegistrationId(
  registrationId: string,
): Promise<OpportunityRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateOpportunity(
  id: string,
  changes: Partial<OpportunityRow>,
): Promise<OpportunityRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('opportunities')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
