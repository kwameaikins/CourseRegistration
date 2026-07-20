// Data access for the certificates module. Issuance and public
// verification/download run on the service-role client (route-level
// requireRole guards the admin paths; the row UUID / certificate number are
// the public access tokens). The registry list read runs on the
// RLS-enforced server client.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type CertificateRow = Database['public']['Tables']['certificates']['Row'];
type CertificateInsert = Database['public']['Tables']['certificates']['Insert'];

export async function selectCertificates(limit: number): Promise<CertificateRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function insertCertificate(
  row: CertificateInsert,
): Promise<{ outcome: 'inserted'; row: CertificateRow } | { outcome: 'duplicate' }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('certificates')
    .insert(row)
    .select()
    .single();
  if (error?.code === '23505') return { outcome: 'duplicate' };
  if (error) throw error;
  return { outcome: 'inserted', row: data };
}

// Highest existing serial for a course code + year across ALL prefixes
// (KNS and the legacy KNW registry), so new numbers continue the historic
// count — after KNW-AI01-2026-0065 comes KNS-AI01-2026-0066.
export async function selectMaxSerialForCourseYear(
  courseCode: string,
  year: number,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('certificates')
    .select('certificate_number')
    .like('certificate_number', `%-${courseCode}-${year}-%`);
  if (error) throw error;
  let max = 0;
  for (const row of data ?? []) {
    const serial = Number.parseInt(row.certificate_number.split('-').pop() ?? '', 10);
    if (!Number.isNaN(serial) && serial > max) max = serial;
  }
  return max;
}

// Serial floor from the legacy AppScript counter (courses table) — some
// paper certificates predate the exported registry, so numbering takes
// max(registry, floor) for 2026.
export async function selectCourseSerialFloor(courseCode: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('courses')
    .select('certificate_serial_floor')
    .eq('course_code', courseCode)
    .maybeSingle();
  if (error) throw error;
  return data?.certificate_serial_floor ?? 0;
}

export async function selectCertificateById(id: string): Promise<CertificateRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectCertificateByNumber(
  certificateNumber: string,
): Promise<CertificateRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('certificate_number', certificateNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateCertificate(
  id: string,
  changes: Partial<Pick<CertificateRow, 'revoked' | 'revoked_reason'>>,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('certificates').update(changes).eq('id', id);
  if (error) throw error;
}

// Batch-issue context: every registration on the batch with payment status,
// feedback presence, attendance ratio, and existing-certificate flag.
export async function selectBatchIssueContext(batchId: string): Promise<{
  courseCode: string;
  courseTitle: string;
  defaultHours: number;
  defaultDescription: string;
  defaultCpdCredit: string;
  candidates: Array<{
    registrationId: string;
    participantName: string;
    participantEmail: string;
    participantDeleted: boolean;
    paid: boolean;
    feedbackSubmitted: boolean;
    attendedSessions: number;
    totalSessions: number;
    alreadyIssued: boolean;
  }>;
} | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id, course_id')
    .eq('id', batchId)
    .maybeSingle();
  if (batchError) throw batchError;
  if (!batch) return null;

  const { data: course } = await supabase
    .from('courses')
    .select('course_code, course_name, certificate_hours, certificate_description, cpd_credit')
    .eq('id', batch.course_id)
    .maybeSingle();
  if (!course) return null;

  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, participant_id')
    .eq('batch_id', batchId);
  if (regError) throw regError;
  const courseDefaults = {
    courseCode: course.course_code,
    courseTitle: course.course_name,
    defaultHours: course.certificate_hours,
    defaultDescription: course.certificate_description,
    defaultCpdCredit: course.cpd_credit,
  };
  if (!registrations || registrations.length === 0) {
    return { ...courseDefaults, candidates: [] };
  }
  const registrationIds = registrations.map((r) => r.id);

  const [
    { data: participants },
    { data: payments },
    { data: feedbackRows },
    { data: attendanceRows },
    { data: existingCerts },
  ] = await Promise.all([
    supabase
      .from('participants')
      .select('id, full_name, email, deleted_at')
      .in('id', registrations.map((r) => r.participant_id)),
    supabase
      .from('payments')
      .select('registration_id, payment_status')
      .in('registration_id', registrationIds),
    supabase.from('feedback').select('registration_id').in('registration_id', registrationIds),
    supabase
      .from('attendance')
      .select('registration_id, session_date')
      .in('registration_id', registrationIds),
    supabase
      .from('certificates')
      .select('registration_id')
      .in('registration_id', registrationIds),
  ]);

  const participantById = new Map((participants ?? []).map((p) => [p.id, p]));
  const statusByRegistration = new Map(
    (payments ?? []).map((p) => [p.registration_id, p.payment_status]),
  );
  const feedbackSet = new Set((feedbackRows ?? []).map((row) => row.registration_id));
  const certSet = new Set(
    (existingCerts ?? [])
      .map((row) => row.registration_id)
      .filter((id): id is string => !!id),
  );
  const sessionDates = new Set((attendanceRows ?? []).map((row) => row.session_date));
  const attendedByRegistration = new Map<string, number>();
  for (const row of attendanceRows ?? []) {
    attendedByRegistration.set(
      row.registration_id,
      (attendedByRegistration.get(row.registration_id) ?? 0) + 1,
    );
  }

  return {
    ...courseDefaults,
    candidates: registrations.map((registration) => {
      const participant = participantById.get(registration.participant_id);
      return {
        registrationId: registration.id,
        participantName: participant?.full_name ?? '',
        participantEmail: participant?.email ?? '',
        participantDeleted: participant?.deleted_at !== null,
        paid: statusByRegistration.get(registration.id) === 'Paid',
        feedbackSubmitted: feedbackSet.has(registration.id),
        attendedSessions: attendedByRegistration.get(registration.id) ?? 0,
        totalSessions: sessionDates.size,
        alreadyIssued: certSet.has(registration.id),
      };
    }),
  };
}
