// Data access only — business rules live in service.ts. `tutors` uses the
// session client (RLS-gated to admin/management, the staff-facing screen);
// tutor_auth/tutor_sessions and every tutor-portal dashboard read use the
// service-role client exclusively — tutors have no Supabase Auth session
// for RLS to key off, same posture as modules/portal and modules/corporate.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { CreateTutorInput } from '@/modules/tutors/types';

type TutorRow = Database['public']['Tables']['tutors']['Row'];
type TutorAuthRow = Database['public']['Tables']['tutor_auth']['Row'];
type TutorSessionRow = Database['public']['Tables']['tutor_sessions']['Row'];
type BatchRow = Database['public']['Tables']['batches']['Row'];
type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];
type RegistrationRow = Database['public']['Tables']['registrations']['Row'];
type ParticipantRow = Database['public']['Tables']['participants']['Row'];

// --- Staff-facing CRUD (/tutors screen, admin/management RLS) ---

export async function selectTutors(): Promise<TutorRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('tutors').select('*').order('full_name');
  if (error) throw error;
  return data ?? [];
}

export async function selectTutorById(id: string): Promise<TutorRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('tutors').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertTutor(input: CreateTutorInput): Promise<TutorRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tutors')
    .insert({ full_name: input.fullName, email: input.email, phone: input.phone })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTutorById(
  id: string,
  changes: { full_name?: string; email?: string; phone?: string },
): Promise<TutorRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tutors')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- System-context reads (no staff session — portal auth, dashboard data) ---

export async function selectTutorByEmailSystem(email: string): Promise<TutorRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('tutors').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectTutorByIdSystem(id: string): Promise<TutorRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('tutors').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTutorContactSystem(
  id: string,
  changes: { full_name: string; phone: string },
): Promise<TutorRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tutors')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Tutor portal auth (mirrors modules/corporate/repository.ts's
// company_admin_auth/company_admin_sessions functions exactly). ---

export async function selectTutorAuth(tutorId: string): Promise<TutorAuthRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tutor_auth')
    .select('*')
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertTutorAuthIfMissing(tutorId: string, pinHash: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('tutor_auth')
    .upsert(
      { tutor_id: tutorId, pin_hash: pinHash, must_change_pin: true },
      { onConflict: 'tutor_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function recordFailedTutorLogin(
  tutorId: string,
  changes: { failed_attempts: number; locked_until: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('tutor_auth').update(changes).eq('tutor_id', tutorId);
  if (error) throw error;
}

export async function recordSuccessfulTutorLogin(tutorId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('tutor_auth')
    .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq('tutor_id', tutorId);
  if (error) throw error;
}

export async function updateTutorPin(tutorId: string, pinHash: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('tutor_auth')
    .update({ pin_hash: pinHash, must_change_pin: false })
    .eq('tutor_id', tutorId);
  if (error) throw error;
}

export async function insertTutorSession(tutorId: string, expiresAt: string): Promise<TutorSessionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tutor_sessions')
    .insert({ tutor_id: tutorId, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectTutorSession(sessionId: string): Promise<TutorSessionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tutor_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function revokeTutorSession(sessionId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('tutor_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

// --- Tutor portal dashboard data (service-role, scoped by tutorId in
// every query — the portal has no RLS to fall back on). ---

// Used only to compute a batch count per tutor for the /tutors staff list
// — a single cheap query instead of N+1 per-tutor lookups.
export async function selectAllBatchFacilitatorLinksSystem(): Promise<
  Array<{ facilitator_tutor_id: string | null }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('batches').select('facilitator_tutor_id');
  if (error) throw error;
  return data ?? [];
}

export async function selectBatchesForTutorSystem(tutorId: string): Promise<BatchRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('facilitator_tutor_id', tutorId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Ownership check used before any roster/attendance/certificate read —
// never trusts a client-supplied batchId without confirming it belongs to
// this tutor first.
export async function selectBatchForTutorSystem(
  batchId: string,
  tutorId: string,
): Promise<BatchRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('id', batchId)
    .eq('facilitator_tutor_id', tutorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectCoursesByIdsSystem(
  courseIds: string[],
): Promise<Array<{ id: string; course_name: string }>> {
  if (courseIds.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', courseIds);
  if (error) throw error;
  return data ?? [];
}

// Dual assignment path (same as the RLS policy this replaces): a session
// belongs to this tutor if it's directly assigned OR its batch is.
export async function selectLiveSessionsForTutorSystem(
  tutorId: string,
  batchIds: string[],
): Promise<LiveSessionRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const orParts = [`tutor_id.eq.${tutorId}`];
  if (batchIds.length > 0) orParts.push(`batch_id.in.(${batchIds.join(',')})`);
  const { data, error } = await supabase
    .from('live_sessions')
    .select('*')
    .or(orParts.join(','))
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// --- Tutor action audit log (Tutor Portal Phase 4, founder-approved
// 2026-07-31). Service-role only — tutors have no Supabase Auth session
// for RLS to key off. Staff reads go through this same client, gated by
// usersService.requireRole in the service layer instead of RLS. ---

export async function insertTutorActionAuditLogSystem(input: {
  tutor_id: string;
  action_type: string;
  target_batch_id?: string | null;
  details?: Json;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('tutor_action_audit_log').insert({
    tutor_id: input.tutor_id,
    action_type: input.action_type,
    target_batch_id: input.target_batch_id ?? null,
    details: input.details ?? {},
  });
  if (error) throw error;
}

export async function selectRecentTutorActionAuditLogSystem(
  limit = 50,
): Promise<Database['public']['Tables']['tutor_action_audit_log']['Row'][]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tutor_action_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function selectTutorNamesByIdsSystem(
  ids: string[],
): Promise<Array<{ id: string; full_name: string }>> {
  if (ids.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('tutors').select('id, full_name').in('id', ids);
  if (error) throw error;
  return data ?? [];
}

// Confirmed-registration counts per batch — the number of registered
// students is not a payment field, so this is safe to surface to tutors
// (unlike anything in the payments table, see selectRosterForBatchSystem).
export async function selectRegisteredCountsForBatchesSystem(
  batchIds: string[],
): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map();
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registrations')
    .select('batch_id')
    .in('batch_id', batchIds)
    .eq('registration_status', 'Confirmed');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.batch_id, (counts.get(row.batch_id) ?? 0) + 1);
  }
  return counts;
}

// Confirms a client-supplied registrationId actually belongs to the given
// batch, before modules/tutors delegates to attendanceService.raiseAttendanceException.
export async function selectRegistrationBelongsToBatchSystem(
  registrationId: string,
  batchId: string,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registrations')
    .select('id')
    .eq('id', registrationId)
    .eq('batch_id', batchId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

// Roster for one batch — deliberately never selects the payments table at
// all (stronger than the staff role-based strip-after-fetch pattern in
// registrationsService.shapeRowForRole), and only Confirmed registrations,
// same as the staff Tutor page this replaces.
export async function selectRosterForBatchSystem(batchId: string): Promise<
  Array<{ registration: RegistrationRow; participant: ParticipantRow | null }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('batch_id', batchId)
    .eq('registration_status', 'Confirmed')
    .order('registered_at', { ascending: true });
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const participantIds = [...new Set(registrations.map((row) => row.participant_id))];
  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('*')
    .in('id', participantIds);
  if (participantsError) throw participantsError;

  const participantById = new Map((participants ?? []).map((row) => [row.id, row]));
  return registrations.map((registration) => ({
    registration,
    participant: participantById.get(registration.participant_id) ?? null,
  }));
}
