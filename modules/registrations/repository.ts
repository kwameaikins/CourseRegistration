// Data access only — business rules live in service.ts (Document 11, Section 3).
//
// The public registration creation path runs on the service-role client: the
// anon role deliberately has no RLS SELECT policies on participants/
// registrations/payments (the public anon key must never read PII), so the
// validated server-side orchestration (Document 5, Section 2) uses the
// trusted client instead. Staff list/detail reads use the session client so
// RLS applies per role.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { RegistrationListFilters } from '@/modules/registrations/types';

type ParticipantRow = Database['public']['Tables']['participants']['Row'];
type RegistrationRow = Database['public']['Tables']['registrations']['Row'];
type PaymentRow = Database['public']['Tables']['payments']['Row'];

// BR-02: atomic upsert on the unique email — two simultaneous registrations
// from the same new email cannot create two Participant rows, and a repeat
// registration refreshes the Participant's latest contact details.
export async function findOrCreateParticipant(input: {
  full_name: string;
  first_name: string;
  middle_name: string | null;
  surname: string;
  gender: 'Male' | 'Female';
  email: string;
  phone: string;
  job_title: string | null;
  company: string | null;
}): Promise<ParticipantRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('participants')
    .upsert(
      {
        email: input.email,
        full_name: input.full_name,
        first_name: input.first_name,
        middle_name: input.middle_name,
        surname: input.surname,
        gender: input.gender,
        phone: input.phone,
        job_title: input.job_title,
        company: input.company,
        consent_given: true,
        consent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email', ignoreDuplicates: false },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertRegistration(input: {
  participant_id: string;
  batch_id: string;
  lead_source: RegistrationRow['lead_source'];
  consent_given: boolean;
}): Promise<RegistrationRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registrations')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertInitialPayment(input: {
  registration_id: string;
  course_fee: number;
}): Promise<PaymentRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .insert({ ...input, amount_paid: 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Staff Registration List query (F1.03) — session client, RLS filters rows
// per role (Tutor sees only Confirmed rows in own batches, etc.).
export async function selectRegistrationList(filters: RegistrationListFilters): Promise<{
  rows: Array<{
    registration: RegistrationRow;
    participant: Pick<
      ParticipantRow,
      'full_name' | 'email' | 'phone' | 'job_title' | 'company' | 'gender'
    > | null;
    payment: PaymentRow | null;
    batch: { cohort_label: string; course_id: string } | null;
    course: { course_name: string; course_code: string } | null;
    verifiedByName: string | null;
  }>;
  total: number;
}> {
  const supabase = await createSupabaseServerClient();

  let batchIdFilter: string[] | null = null;
  if (filters.courseId) {
    const { data: courseBatches, error } = await supabase
      .from('batches')
      .select('id')
      .eq('course_id', filters.courseId);
    if (error) throw error;
    batchIdFilter = courseBatches.map((batch) => batch.id);
    if (batchIdFilter.length === 0) return { rows: [], total: 0 };
  }

  let query = supabase
    .from('registrations')
    .select('*', { count: 'exact' })
    .order('registered_at', { ascending: false });

  if (filters.batchId) query = query.eq('batch_id', filters.batchId);
  else if (batchIdFilter) query = query.in('batch_id', batchIdFilter);
  if (filters.registrationStatus) {
    query = query.eq('registration_status', filters.registrationStatus);
  }
  if (filters.leadSource) query = query.eq('lead_source', filters.leadSource);
  if (filters.dateFrom) query = query.gte('registered_at', `${filters.dateFrom}T00:00:00Z`);
  if (filters.dateTo) query = query.lte('registered_at', `${filters.dateTo}T23:59:59Z`);

  const offset = (filters.page - 1) * filters.limit;
  query = query.range(offset, offset + filters.limit - 1);

  const { data: registrations, error: registrationsError, count } = await query;
  if (registrationsError) throw registrationsError;
  if (registrations.length === 0) return { rows: [], total: count ?? 0 };

  const participantIds = [...new Set(registrations.map((r) => r.participant_id))];
  const batchIds = [...new Set(registrations.map((r) => r.batch_id))];
  const registrationIds = registrations.map((r) => r.id);

  const [participantsResult, batchesResult, paymentsResult] = await Promise.all([
    supabase
      .from('participants')
      .select('id, full_name, email, phone, job_title, company, gender')
      .in('id', participantIds),
    supabase.from('batches').select('id, cohort_label, course_id').in('id', batchIds),
    supabase.from('payments').select('*').in('registration_id', registrationIds),
  ]);
  if (participantsResult.error) throw participantsResult.error;
  if (batchesResult.error) throw batchesResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const courseIds = [...new Set(batchesResult.data.map((batch) => batch.course_id))];
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_name, course_code')
    .in('id', courseIds);
  if (coursesError) throw coursesError;

  const verifiedByIds = [
    ...new Set(
      paymentsResult.data
        .map((payment) => payment.verified_by)
        .filter((value): value is string => value !== null),
    ),
  ];
  const verifiedByNames = new Map<string, string>();
  if (verifiedByIds.length > 0) {
    const { data: staffRows } = await supabase
      .from('staff_users')
      .select('id, full_name')
      .in('id', verifiedByIds);
    for (const staff of staffRows ?? []) {
      verifiedByNames.set(staff.id, staff.full_name);
    }
  }

  const participantById = new Map(participantsResult.data.map((p) => [p.id, p]));
  const batchById = new Map(batchesResult.data.map((b) => [b.id, b]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const paymentByRegistrationId = new Map(
    paymentsResult.data.map((payment) => [payment.registration_id, payment]),
  );

  const rows = registrations.map((registration) => {
    const batch = batchById.get(registration.batch_id) ?? null;
    const payment = paymentByRegistrationId.get(registration.id) ?? null;
    return {
      registration,
      participant: participantById.get(registration.participant_id) ?? null,
      payment,
      batch,
      course: batch ? (courseById.get(batch.course_id) ?? null) : null,
      verifiedByName: payment?.verified_by
        ? (verifiedByNames.get(payment.verified_by) ?? null)
        : null,
    };
  });

  return { rows, total: count ?? rows.length };
}

// Registration 360° view (system review, approved 2026-07-20): one
// aggregating read across every module that touches a Registration —
// payment, every message channel, Zoom attendance, feedback, certificates,
// and voice calls. Runs on the service-role client (same posture as the
// certificates/voice repositories) because several of the joined tables'
// own RLS policies are scoped narrower than the roles that may legitimately
// view a registration's payment/engagement history (e.g. email_log is
// admin-only, attendance is admin+management-only) — the service layer
// applies the real role-based shaping explicitly instead of leaning on
// per-table RLS, so the shaping logic is visible in one place rather than
// split across ten migrations.
export async function selectRegistration360(registrationId: string): Promise<{
  registration: RegistrationRow;
  participant: ParticipantRow | null;
  payment: PaymentRow | null;
  batch: Database['public']['Tables']['batches']['Row'] | null;
  course: { course_name: string; course_code: string } | null;
  verifiedByName: string | null;
  discountGrantedByName: string | null;
  emailLog: Array<{
    email_type: string;
    sent_at: string;
    success: boolean;
    error_message: string | null;
  }>;
  whatsappLog: Array<{
    message_type: string;
    sent_at: string;
    success: boolean;
    error_message: string | null;
  }>;
  smsLog: Array<{
    message_type: string;
    sent_at: string;
    success: boolean;
    error_message: string | null;
  }>;
  zoomRegistrant: { join_url: string; created_at: string } | null;
  attendance: Array<{
    session_date: string;
    join_time: string | null;
    leave_time: string | null;
    duration_minutes: number;
  }>;
  feedback: Database['public']['Tables']['feedback']['Row'] | null;
  certificates: Array<Database['public']['Tables']['certificates']['Row']>;
  calls: Array<Database['public']['Tables']['call_log']['Row']>;
} | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('*')
    .eq('id', registrationId)
    .maybeSingle();
  if (registrationError) throw registrationError;
  if (!registration) return null;

  const [
    { data: participant },
    { data: batch },
    { data: payment },
    { data: emailLog },
    { data: whatsappLog },
    { data: smsLog },
    { data: zoomRegistrant },
    { data: attendance },
    { data: feedback },
    { data: certificates },
    { data: calls },
  ] = await Promise.all([
    supabase.from('participants').select('*').eq('id', registration.participant_id).maybeSingle(),
    supabase.from('batches').select('*').eq('id', registration.batch_id).maybeSingle(),
    supabase.from('payments').select('*').eq('registration_id', registrationId).maybeSingle(),
    supabase
      .from('email_log')
      .select('email_type, sent_at, success, error_message')
      .eq('registration_id', registrationId)
      .order('sent_at', { ascending: true }),
    supabase
      .from('whatsapp_log')
      .select('message_type, sent_at, success, error_message')
      .eq('registration_id', registrationId)
      .order('sent_at', { ascending: true }),
    supabase
      .from('sms_log')
      .select('message_type, sent_at, success, error_message')
      .eq('registration_id', registrationId)
      .order('sent_at', { ascending: true }),
    supabase
      .from('zoom_registrants')
      .select('join_url, created_at')
      .eq('registration_id', registrationId)
      .maybeSingle(),
    supabase
      .from('attendance')
      .select('session_date, join_time, leave_time, duration_minutes')
      .eq('registration_id', registrationId)
      .order('session_date', { ascending: true }),
    supabase.from('feedback').select('*').eq('registration_id', registrationId).maybeSingle(),
    supabase
      .from('certificates')
      .select('*')
      .eq('registration_id', registrationId)
      .order('issued_date', { ascending: false }),
    supabase
      .from('call_log')
      .select('*')
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false }),
  ]);

  const course = batch
    ? await supabase
        .from('courses')
        .select('course_name, course_code')
        .eq('id', batch.course_id)
        .maybeSingle()
        .then((res) => res.data)
    : null;

  let verifiedByName: string | null = null;
  if (payment?.verified_by) {
    const { data: staff } = await supabase
      .from('staff_users')
      .select('full_name')
      .eq('id', payment.verified_by)
      .maybeSingle();
    verifiedByName = staff?.full_name ?? null;
  }

  let discountGrantedByName: string | null = null;
  if (payment?.discount_granted_by) {
    const { data: staff } = await supabase
      .from('staff_users')
      .select('full_name')
      .eq('id', payment.discount_granted_by)
      .maybeSingle();
    discountGrantedByName = staff?.full_name ?? null;
  }

  return {
    registration,
    participant,
    payment,
    batch,
    course,
    verifiedByName,
    discountGrantedByName,
    emailLog: emailLog ?? [],
    whatsappLog: whatsappLog ?? [],
    smsLog: smsLog ?? [],
    zoomRegistrant,
    attendance: attendance ?? [],
    feedback,
    certificates: certificates ?? [],
    calls: calls ?? [],
  };
}

export async function updateRegistrationNotes(
  registrationId: string,
  notes: string | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('registrations')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', registrationId);
  if (error) throw error;
}

// DPA deletion functions (Document 3, Section 8) — SECURITY DEFINER functions
// that verify the caller is an active Admin internally, called via the
// session client so auth.uid() resolves to the calling staff member.
export async function callSoftDeleteParticipant(participantId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('fn_soft_delete_participant', {
    participant_id_to_delete: participantId,
  });
  if (error) throw error;
}

export async function callHardDeleteParticipant(
  participantId: string,
  staffId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('fn_hard_delete_participant', {
    participant_id_to_delete: participantId,
    deleting_staff_id: staffId,
  });
  if (error) throw error;
}

export async function selectParticipantsForAdmin(): Promise<
  Array<
    Pick<
      ParticipantRow,
      'id' | 'full_name' | 'email' | 'phone' | 'job_title' | 'company' | 'deleted_at'
    >
  >
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('participants')
    .select('id, full_name, email, phone, job_title, company, deleted_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Immediate hard-delete of wrongly-entered/test data (founder-approved
// 2026-07-22) — deliberately separate from the DPA erasure flow above.
// SECURITY DEFINER functions verify the caller is an active Admin
// internally, called via the session client so auth.uid() resolves to the
// calling staff member.
export async function callDeleteRegistrationImmediately(
  registrationId: string,
  staffId: string,
  reason: string | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('fn_delete_registration_immediately', {
    registration_id_to_delete: registrationId,
    deleting_staff_id: staffId,
    reason,
  });
  if (error) throw error;
}

export async function callDeleteParticipantImmediately(
  participantId: string,
  staffId: string,
  reason: string | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('fn_delete_participant_immediately', {
    participant_id_to_delete: participantId,
    deleting_staff_id: staffId,
    reason,
  });
  if (error) throw error;
}
