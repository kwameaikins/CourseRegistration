// Data access only — business rules live in service.ts. Runs exclusively on
// the service-role client: participant_auth/participant_sessions grant
// nothing to anon/authenticated (Document review, 2026-07-22 — see the
// migration header for why), matching the register/verify/feedback
// convention of server-side scoping instead of RLS for public surfaces.
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type ParticipantAuthRow = Database['public']['Tables']['participant_auth']['Row'];
type ParticipantSessionRow = Database['public']['Tables']['participant_sessions']['Row'];

export async function selectParticipantByIdentifier(identifier: string): Promise<{
  id: string;
  full_name: string;
  email: string;
  phone: string;
  deleted_at: string | null;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const trimmed = identifier.trim();

  if (trimmed.includes('@')) {
    const { data, error } = await supabase
      .from('participants')
      .select('id, full_name, email, phone, deleted_at')
      .eq('email', trimmed.toLowerCase())
      .limit(1);
    if (error) throw error;
    return data[0] ?? null;
  }

  // Ghana phone numbers arrive in several shapes (0-prefixed 10-digit,
  // +233-prefixed, 9-digit with the leading 0 dropped) — matching on the
  // last 9 digits sidesteps needing to know which shape is stored.
  const digits = trimmed.replace(/\D/g, '');
  const last9 = digits.slice(-9);
  if (last9.length < 9) return null;
  const { data, error } = await supabase
    .from('participants')
    .select('id, full_name, email, phone, deleted_at')
    .ilike('phone', `%${last9}`)
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

// One-off backfill support (system review, 2026-07-22): every participant
// who registered before the portal existed still needs a participant_auth
// row. Triggered via an admin-only endpoint rather than a local script —
// idempotent, safe to re-run.
export async function selectAllActiveParticipants(): Promise<
  Array<{ id: string; phone: string }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('participants')
    .select('id, phone')
    .is('deleted_at', null);
  if (error) throw error;
  return data;
}

export async function selectParticipantAuth(
  participantId: string,
): Promise<ParticipantAuthRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('participant_auth')
    .select('*')
    .eq('participant_id', participantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Idempotent — never overwrites an existing row, so a returning participant
// who already changed their PIN keeps it (called from registration creation
// every time, not just the first time).
export async function insertParticipantAuthIfMissing(
  participantId: string,
  pinHash: string,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('participant_auth')
    .upsert(
      { participant_id: participantId, pin_hash: pinHash, must_change_pin: true },
      { onConflict: 'participant_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function recordFailedLogin(
  participantId: string,
  changes: { failed_attempts: number; locked_until: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('participant_auth')
    .update({
      failed_attempts: changes.failed_attempts,
      locked_until: changes.locked_until,
      updated_at: new Date().toISOString(),
    })
    .eq('participant_id', participantId);
  if (error) throw error;
}

export async function recordSuccessfulLogin(participantId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('participant_auth')
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('participant_id', participantId);
  if (error) throw error;
}

export async function updateParticipantPin(
  participantId: string,
  pinHash: string,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('participant_auth')
    .update({ pin_hash: pinHash, must_change_pin: false, updated_at: new Date().toISOString() })
    .eq('participant_id', participantId);
  if (error) throw error;
}

export async function insertSession(
  participantId: string,
  expiresAt: string,
): Promise<ParticipantSessionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('participant_sessions')
    .insert({ participant_id: participantId, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectSession(
  sessionId: string,
): Promise<ParticipantSessionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('participant_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function revokeSession(sessionId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('participant_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

// Portal auto-login token support (founder-approved 2026-07-22) — see the
// portal_login_tokens migration header for the trust model.
export async function selectParticipantIdForRegistration(
  registrationId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registrations')
    .select('participant_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data?.participant_id ?? null;
}

export async function insertLoginToken(
  participantId: string,
  registrationId: string,
  expiresAt: string,
): Promise<{ id: string }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('portal_login_tokens')
    .insert({ participant_id: participantId, registration_id: registrationId, expires_at: expiresAt })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

// Atomic single-statement consume — race-safe by construction: two
// concurrent exchange requests for the same registration can never both
// succeed, because the second UPDATE's WHERE clause no longer matches once
// the first has set consumed_at. In the ordinary case there is at most one
// live token per registration (minting is guarded by webhook idempotency);
// if a retry ever produced more than one, consuming all of them together is
// harmless since they all resolve to the same participant.
export async function consumeLoginToken(
  registrationId: string,
): Promise<{ participantId: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('portal_login_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('registration_id', registrationId)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('participant_id');
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return { participantId: data[0].participant_id };
}

// Everything the portal dashboard needs about one Participant, across every
// Registration they have — service-role client, explicit participant_id
// scoping (never trusts a client-supplied id past the session lookup).
export async function selectPortalDashboardData(participantId: string): Promise<{
  participant: { full_name: string; email: string; phone: string } | null;
  registrations: Array<{
    registration: Database['public']['Tables']['registrations']['Row'];
    batch: Database['public']['Tables']['batches']['Row'] | null;
    course: { course_name: string; course_code: string } | null;
    payment: Database['public']['Tables']['payments']['Row'] | null;
    zoomRegistrant: { join_url: string } | null;
    attendance: Array<{
      session_date: string;
      join_time: string | null;
      leave_time: string | null;
      duration_minutes: number;
    }>;
    certificates: Array<{
      id: string;
      certificate_number: string;
      issued_date: string;
      revoked: boolean;
    }>;
  }>;
}> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('full_name, email, phone')
    .eq('id', participantId)
    .maybeSingle();
  if (participantError) throw participantError;

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('*')
    .eq('participant_id', participantId)
    .order('registered_at', { ascending: false });
  if (registrationsError) throw registrationsError;
  if (registrations.length === 0) return { participant, registrations: [] };

  const registrationIds = registrations.map((r) => r.id);
  const batchIds = [...new Set(registrations.map((r) => r.batch_id))];

  const [batchesResult, paymentsResult, zoomResult, attendanceResult, certificatesResult] =
    await Promise.all([
      supabase.from('batches').select('*').in('id', batchIds),
      supabase.from('payments').select('*').in('registration_id', registrationIds),
      supabase
        .from('zoom_registrants')
        .select('registration_id, join_url')
        .in('registration_id', registrationIds),
      supabase
        .from('attendance')
        .select('registration_id, session_date, join_time, leave_time, duration_minutes')
        .in('registration_id', registrationIds)
        .order('session_date', { ascending: true }),
      supabase
        .from('certificates')
        .select('id, registration_id, certificate_number, issued_date, revoked')
        .in('registration_id', registrationIds),
    ]);
  if (batchesResult.error) throw batchesResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (zoomResult.error) throw zoomResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (certificatesResult.error) throw certificatesResult.error;

  const courseIds = [...new Set(batchesResult.data.map((b) => b.course_id))];
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_name, course_code')
    .in('id', courseIds);
  if (coursesError) throw coursesError;

  const batchById = new Map(batchesResult.data.map((b) => [b.id, b]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const paymentByRegId = new Map(paymentsResult.data.map((p) => [p.registration_id, p]));
  const zoomByRegId = new Map(zoomResult.data.map((z) => [z.registration_id, z]));

  return {
    participant,
    registrations: registrations.map((registration) => {
      const batch = batchById.get(registration.batch_id) ?? null;
      const course = batch ? (courseById.get(batch.course_id) ?? null) : null;
      return {
        registration,
        batch,
        course: course ? { course_name: course.course_name, course_code: course.course_code } : null,
        payment: paymentByRegId.get(registration.id) ?? null,
        zoomRegistrant: zoomByRegId.get(registration.id)
          ? { join_url: zoomByRegId.get(registration.id)!.join_url }
          : null,
        attendance: attendanceResult.data
          .filter((a) => a.registration_id === registration.id)
          .map((a) => ({
            session_date: a.session_date,
            join_time: a.join_time,
            leave_time: a.leave_time,
            duration_minutes: a.duration_minutes,
          })),
        certificates: certificatesResult.data
          .filter((c) => c.registration_id === registration.id)
          .map((c) => ({
            id: c.id,
            certificate_number: c.certificate_number,
            issued_date: c.issued_date,
            revoked: c.revoked,
          })),
      };
    }),
  };
}
