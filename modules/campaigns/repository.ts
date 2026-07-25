import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { CreateCampaignInput } from '@/modules/campaigns/types';

type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type CampaignMemberRow = Database['public']['Tables']['campaign_members']['Row'];

export async function insertCampaign(
  input: CreateCampaignInput,
  createdBy: string | null,
): Promise<CampaignRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: input.name,
      channel: input.channel,
      message_subject: input.messageSubject ?? null,
      message_body: input.messageBody,
      filter_lead_source: input.filterLeadSource ?? null,
      filter_status: input.filterStatus ?? null,
      filter_min_score: input.filterMinScore ?? null,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function selectCampaigns(): Promise<CampaignRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function selectCampaignById(id: string): Promise<CampaignRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markCampaignQueued(id: string): Promise<CampaignRow> {
  const supabase = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'queued', queued_at: now, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function insertCampaignMembers(
  rows: { campaign_id: string; lead_id: string; preview_message: string }[],
): Promise<CampaignMemberRow[]> {
  if (rows.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('campaign_members').insert(rows).select();

  if (error) throw error;
  return data ?? [];
}

export async function selectCampaignMembers(campaignId: string): Promise<CampaignMemberRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('campaign_members')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
