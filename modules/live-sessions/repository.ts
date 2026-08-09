import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database, Json } from '@/lib/supabase/database.types';

type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];
type LiveSessionInsert = Database['public']['Tables']['live_sessions']['Insert'];
type LiveSessionUpdate = Database['public']['Tables']['live_sessions']['Update'];
type SessionMaterialRow = Database['public']['Tables']['session_materials']['Row'];
type SessionMaterialInsert = Database['public']['Tables']['session_materials']['Insert'];

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

// --- Generated schedules (2026-08-08) ---
//
// Service-role throughout: generation runs from batch create/update (a staff
// session) but also from a backfill over every existing batch, where there is
// no session at all. Authorization is the caller's — createBatch is already
// role-gated, and the backfill is admin-only in the service.

export async function selectBatchScheduleSystem(batchId: string): Promise<{
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string | null;
  meetingDays: number[] | null;
  courseName: string;
  zoomMeetingId: string | null;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: batch, error } = await supabase
    .from('batches')
    .select('course_id, start_date, end_date, start_time, end_time, meeting_days, zoom_meeting_id')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch) return null;

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('course_name')
    .eq('id', batch.course_id)
    .maybeSingle();
  if (courseError) throw courseError;

  return {
    startDate: batch.start_date,
    endDate: batch.end_date,
    startTime: batch.start_time,
    endTime: batch.end_time,
    meetingDays: batch.meeting_days,
    courseName: course?.course_name ?? 'Course',
    zoomMeetingId: batch.zoom_meeting_id,
  };
}

// Idempotent by (batch_id, starts_at) — the unique constraint added in
// 202608080058 is what makes re-generation safe. `ignoreDuplicates` means a
// re-run after a schedule edit adds the new sessions and leaves the existing
// ones (and any title, agenda or tutor a human has since set) untouched.
export async function upsertGeneratedSessionsSystem(
  rows: LiveSessionInsert[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('live_sessions')
    .upsert(rows, { onConflict: 'batch_id,starts_at', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// Every distinct classroom meeting in use, across both places one can live:
// courses.zoom_meeting_id (the shared type 3 room every batch inherits) and
// batches.zoom_meeting_id (a batch's own type 8 room since 202608080056).
export async function selectAllZoomMeetingIdsSystem(): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: courses, error }, { data: batches, error: batchError }] = await Promise.all([
    supabase.from('courses').select('zoom_meeting_id').not('zoom_meeting_id', 'is', null),
    supabase.from('batches').select('zoom_meeting_id').not('zoom_meeting_id', 'is', null),
  ]);
  if (error) throw error;
  if (batchError) throw batchError;
  return [
    ...new Set(
      [...(courses ?? []), ...(batches ?? [])]
        .map((row) => row.zoom_meeting_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export async function selectBatchIdsSystem(): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('batches').select('id');
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
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

// --- Session Materials (Tutor Portal Phase 4, founder-approved 2026-07-31;
// file uploads added 2026-08-04) ---
// Either a shared link or a Cloudflare R2 object key (file_path) — the DB
// enforces exactly one via chk_session_materials_link_xor_file. Bytes never
// land in Postgres. Tutor/participant-portal writes and reads use the
// service-role client (neither has a Supabase Auth session for RLS to key
// off); the staff screen reads under its own RLS-gated session.

export async function insertSessionMaterialSystem(
  input: SessionMaterialInsert,
): Promise<SessionMaterialRow> {
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