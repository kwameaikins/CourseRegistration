import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/database.types';

type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];
type LiveSessionInsert = Database['public']['Tables']['live_sessions']['Insert'];
type LiveSessionUpdate = Database['public']['Tables']['live_sessions']['Update'];

export async function selectLiveSessions(): Promise<LiveSessionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('live_sessions')
    .select('*')
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function selectLiveSessionById(id: string): Promise<LiveSessionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertLiveSession(input: LiveSessionInsert): Promise<LiveSessionRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('live_sessions')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLiveSessionById(
  id: string,
  changes: LiveSessionUpdate,
): Promise<LiveSessionRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('live_sessions')
    .update(changes)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertLiveSessionAuditEvent(input: {
  live_session_id: string;
  event_type: 'created' | 'updated' | 'status_changed';
  actor_staff_id: string;
  reason?: string | null;
  details: Json;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('live_session_audit_log').insert(input);
  if (error) throw error;
}