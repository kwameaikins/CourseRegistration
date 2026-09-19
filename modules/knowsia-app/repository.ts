// Data access only — business rules live in service.ts (Document 11, Section 3).
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

// Everything the Seam III grant call needs about a registration, in one
// resolve: who the person is (identity travels to KnowsiaApp) and which
// course they paid for (matched to an m2 course by course_code over there).
// What Core's ledger needs about a settled payment (Phase 4 R3): who paid,
// for which cohort (its Release 1 SKU code), the latest payment event that
// settled it, and the company when the seat came from a corporate allocation.
export async function selectPaymentSettledContextSystem(registrationId: string): Promise<{
  participantId: string;
  participantEmail: string;
  participantDeleted: boolean;
  courseCode: string;
  cohortLabel: string;
  companyId: string | null;
  latestEvent: { id: string; amount: number; transactionId: string | null; recordedAt: string; source: string } | null;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registration, error } = await supabase
    .from('registrations')
    .select('participant_id, batch_id, company_allocation_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!registration) return null;

  const [{ data: participant }, { data: batch }, { data: events }] = await Promise.all([
    supabase.from('participants').select('id, email, deleted_at').eq('id', registration.participant_id).maybeSingle(),
    supabase.from('batches').select('course_id, cohort_label').eq('id', registration.batch_id).maybeSingle(),
    supabase.from('payment_events').select('id, amount, transaction_id, recorded_at, source').eq('registration_id', registrationId).order('recorded_at', { ascending: false }).limit(1),
  ]);
  if (!participant || !batch) return null;
  const { data: course } = await supabase.from('courses').select('course_code').eq('id', batch.course_id).maybeSingle();
  if (!course) return null;
  let companyId: string | null = null;
  if (registration.company_allocation_id) {
    const { data: allocation } = await supabase.from('company_batch_allocations').select('company_id').eq('id', registration.company_allocation_id).maybeSingle();
    companyId = allocation?.company_id ?? null;
  }
  const latest = events?.[0];
  return {
    participantId: participant.id,
    participantEmail: participant.email,
    participantDeleted: participant.deleted_at !== null,
    courseCode: course.course_code,
    cohortLabel: batch.cohort_label,
    companyId,
    latestEvent: latest
      ? { id: latest.id, amount: Number(latest.amount), transactionId: latest.transaction_id ?? null, recordedAt: latest.recorded_at, source: latest.source }
      : null,
  };
}

export async function selectLmsGrantContextSystem(registrationId: string): Promise<{
  participantId: string;
  participantEmail: string;
  participantFullName: string;
  participantPhone: string | null;
  participantDeleted: boolean;
  courseCode: string;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registration, error } = await supabase
    .from('registrations')
    .select('participant_id, batch_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!registration) return null;

  const [{ data: participant }, { data: batch }] = await Promise.all([
    supabase
      .from('participants')
      .select('id, email, full_name, phone, deleted_at')
      .eq('id', registration.participant_id)
      .maybeSingle(),
    supabase.from('batches').select('course_id').eq('id', registration.batch_id).maybeSingle(),
  ]);
  if (!participant || !batch) return null;

  const { data: course } = await supabase
    .from('courses')
    .select('course_code')
    .eq('id', batch.course_id)
    .maybeSingle();
  if (!course) return null;

  return {
    participantId: participant.id,
    participantEmail: participant.email,
    participantFullName: participant.full_name,
    participantPhone: participant.phone ?? null,
    participantDeleted: participant.deleted_at !== null,
    courseCode: course.course_code,
  };
}
