import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database, Json } from '@/lib/supabase/database.types';

type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];
type LiveSessionInsert = Database['public']['Tables']['live_sessions']['Insert'];
type LiveSessionUpdate = Database['public']['Tables']['live_sessions']['Update'];
type SessionMaterialRow = Database['public']['Tables']['session_materials']['Row'];

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

// --- Session Materials (Tutor Portal Phase 4, founder-approved 2026-07-31) ---
// Link-based, no file storage (same precedent as batches.resources_link).
// Tutor/participant-portal writes and reads use the service-role client
// (neither has a Supabase Auth session for RLS to key off); the staff
// screen reads under its own RLS-gated session.

export async function insertSessionMaterialSystem(input: {
  batch_id: string;
  live_session_id: string | null;
  uploaded_by_tutor_id: string;
  title: string;
  link: string;
}): Promise<SessionMaterialRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('session_materials').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function selectSessionMaterialByIdSystem(id: string): Promise<SessionMaterialRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('session_materials')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteSessionMaterialSystem(id: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('session_materials').delete().eq('id', id);
  if (error) throw error;
}

export async function selectSessionMaterialsForBatchSystem(
  batchId: string,
): Promise<SessionMaterialRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('session_materials')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Staff-facing read (RLS enforces admin/management, same as /live-sessions).
export async function selectSessionMaterialsForBatch(batchId: string): Promise<SessionMaterialRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('session_materials')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}