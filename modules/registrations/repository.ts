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
