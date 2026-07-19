// Data access for the feedback module. The public form paths run on the
// service-role client by design (same posture as communications): the
// unguessable Registration UUID is the access token, and feedback has no
// anon RLS policies. Staff reads run on the RLS-enforced server client.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type FeedbackTableRow = Database['public']['Tables']['feedback']['Row'];

export async function selectPublicFeedbackContext(registrationId: string): Promise<{
  courseName: string;
  cohortLabel: string;
  participantFirstName: string;
  participantDeleted: boolean;
  alreadySubmitted: boolean;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registration, error } = await supabase
    .from('registrations')
    .select('participant_id, batch_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!registration) return null;

  const [{ data: participant }, { data: batch }, { data: existing }] = await Promise.all([
    supabase
      .from('participants')
      .select('first_name, full_name, deleted_at')
      .eq('id', registration.participant_id)
      .maybeSingle(),
    supabase
      .from('batches')
      .select('cohort_label, course_id')
      .eq('id', registration.batch_id)
      .maybeSingle(),
    supabase
      .from('feedback')
      .select('id')
      .eq('registration_id', registrationId)
      .maybeSingle(),
  ]);
  if (!participant || !batch) return null;

  const { data: course } = await supabase
    .from('courses')
    .select('course_name')
    .eq('id', batch.course_id)
    .maybeSingle();

  return {
    courseName: course?.course_name ?? '',
    cohortLabel: batch.cohort_label,
    participantFirstName:
      participant.first_name ?? participant.full_name.split(' ')[0] ?? '',
    participantDeleted: participant.deleted_at !== null,
    alreadySubmitted: existing !== null,
  };
}

export async function selectCourseNames(): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('courses')
    .select('course_name')
    .order('course_name');
  if (error) throw error;
  return (data ?? []).map((row) => row.course_name);
}

export async function insertFeedback(row: {
  registration_id: string;
  overall_rating: number;
  facilitator_rating: number;
  recommend_rating: number;
  improvement_text: string | null;
  testimonial_consent: boolean;
  comments_anonymous: boolean;
  interested_courses: string | null;
}): Promise<'inserted' | 'duplicate'> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('feedback').insert(row);
  if (error?.code === '23505') return 'duplicate';
  if (error) throw error;
  return 'inserted';
}

// Batches whose last session ended on `dateIso` — the feedback dispatch
// targets these the following morning.
export async function selectBatchesEndedOn(
  dateIso: string,
): Promise<Array<{ id: string }>> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('id')
    .eq('is_active', true)
    .eq('end_date', dateIso);
  if (error) throw error;
  return data ?? [];
}

export async function selectPaidRegistrationIdsForBatch(
  batchId: string,
): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id')
    .eq('batch_id', batchId);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, payment_status')
    .in('registration_id', registrations.map((r) => r.id));
  if (paymentsError) throw paymentsError;

  return (payments ?? [])
    .filter((payment) => payment.payment_status === 'Paid')
    .map((payment) => payment.registration_id);
}

// Staff review read (RLS enforces admin/management on feedback). Participant
// names come along for non-anonymous rows only.
export async function selectFeedbackForBatch(batchId: string): Promise<
  Array<FeedbackTableRow & { participant_name: string | null }>
> {
  const supabase = await createSupabaseServerClient();
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, participants(full_name)')
    .eq('batch_id', batchId);
  if (regError) throw regError;
  if (!registrations || registrations.length === 0) return [];

  const { data: rows, error } = await supabase
    .from('feedback')
    .select('*')
    .in('registration_id', registrations.map((r) => r.id))
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  const nameByRegistration = new Map(
    registrations.map((r) => {
      const participant = Array.isArray(r.participants) ? r.participants[0] : r.participants;
      return [r.id, (participant as { full_name?: string } | null)?.full_name ?? null];
    }),
  );

  return (rows ?? []).map((row) => ({
    ...row,
    participant_name: row.comments_anonymous
      ? null
      : (nameByRegistration.get(row.registration_id) ?? null),
  }));
}

export async function countPaidRegistrationsForBatch(batchId: string): Promise<number> {
  return (await selectPaidRegistrationIdsForBatch(batchId)).length;
}
