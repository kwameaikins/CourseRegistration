import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { CampaignChannel, CreateCampaignInput } from '@/modules/campaigns/types';

type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type CampaignMemberRow = Database['public']['Tables']['campaign_members']['Row'];
type CampaignSendSettingRow = Database['public']['Tables']['campaign_send_settings']['Row'];

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
      audience_type: input.audienceType ?? 'leads',
      filter_lead_source: input.filterLeadSource ?? null,
      filter_status: input.filterStatus ?? null,
      filter_min_score: input.filterMinScore ?? null,
      filter_batch_id: input.filterBatchId ?? null,
      filter_course_id: input.filterCourseId ?? null,
      filter_payment_status: input.filterPaymentStatus ?? null,
      filter_registration_status: input.filterRegistrationStatus ?? null,
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
  rows: {
    campaign_id: string;
    lead_id?: string | null;
    registration_id?: string | null;
    preview_message: string;
  }[],
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

export async function markCampaignMemberSent(id: string, sentAt: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('campaign_members')
    .update({ sent_at: sentAt, send_error: null })
    .eq('id', id);

  if (error) throw error;
}

export async function markCampaignMemberFailed(id: string, sendError: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('campaign_members')
    .update({ send_error: sendError })
    .eq('id', id);

  if (error) throw error;
}

export async function markCampaignSent(id: string): Promise<CampaignRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function selectSendSettings(): Promise<CampaignSendSettingRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('campaign_send_settings').select('*');

  if (error) throw error;
  return data ?? [];
}

export async function selectSendSettingByChannel(
  channel: CampaignChannel,
): Promise<CampaignSendSettingRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('campaign_send_settings')
    .select('*')
    .eq('channel', channel)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateSendSetting(
  channel: CampaignChannel,
  liveEnabled: boolean,
  updatedBy: string | null,
): Promise<CampaignSendSettingRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('campaign_send_settings')
    .update({ live_enabled: liveEnabled, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('channel', channel)
    .select()
    .single();

  if (error) throw error;
  return data;
}
