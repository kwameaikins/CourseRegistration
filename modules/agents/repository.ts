// Read-model queries for the autonomous agents (Agentic layer, 2026-09-03).
//
// Same cross-table read posture as modules/dashboard/repository.ts: agents
// need a joined view of the world to reason over, they write NOTHING here —
// every write goes through the owning module's service functions, so the
// business rules hold.
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export interface OutstandingDebtor {
  registrationId: string;
  participantName: string;
  courseName: string;
  cohortLabel: string;
  batchStartDate: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  paymentStatus: string;
  // A promise captured by the voice agent that has come and gone unpaid.
  brokenPromiseDate: string | null;
  // Second installment overdue/imminent, when a payment plan exists.
  installmentDueDate: string | null;
}

export async function selectOutstandingDebtors(limit: number): Promise<OutstandingDebtor[]> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id, cohort_label, start_date, course_id')
    .eq('is_active', true)
    .eq('is_free', false);
  if (batchesError) throw batchesError;
  if (!batches || batches.length === 0) return [];

  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', [...new Set(batches.map((batch) => batch.course_id))]);
  if (coursesError) throw coursesError;
  const courseNameById = new Map((courses ?? []).map((c) => [c.id, c.course_name]));

  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, batch_id, participant_id')
    .in('batch_id', batches.map((batch) => batch.id))
    .is('lapsed_at', null)
    .neq('registration_status', 'Cancelled');
  if (regError) throw regError;
  if (!registrations || registrations.length === 0) return [];

  const registrationIds = registrations.map((row) => row.id);
  const [{ data: payments }, { data: participants }, { data: calls }, { data: installments }] =
    await Promise.all([
      supabase
        .from('payments')
        .select('registration_id, course_fee, amount_paid, balance, payment_status')
        .in('registration_id', registrationIds)
        .neq('payment_status', 'Paid'),
      supabase
        .from('participants')
        .select('id, full_name, deleted_at')
        .in('id', [...new Set(registrations.map((row) => row.participant_id))]),
      supabase
        .from('call_log')
        .select('registration_id, promised_payment_date')
        .in('registration_id', registrationIds)
        .not('promised_payment_date', 'is', null),
      supabase
        .from('payment_installments')
        .select('registration_id, due_date, payment_status')
        .in('registration_id', registrationIds)
        .eq('payment_status', 'Pending'),
    ]);

  const participantById = new Map((participants ?? []).map((row) => [row.id, row]));
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const promiseByRegistration = new Map<string, string>();
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const call of calls ?? []) {
    if (
      call.registration_id &&
      call.promised_payment_date &&
      call.promised_payment_date < todayIso
    ) {
      promiseByRegistration.set(call.registration_id, call.promised_payment_date);
    }
  }
  const installmentByRegistration = new Map<string, string>();
  for (const row of installments ?? []) {
    installmentByRegistration.set(row.registration_id, row.due_date);
  }

  const debtors: OutstandingDebtor[] = [];
  for (const payment of payments ?? []) {
    const registration = registrations.find((row) => row.id === payment.registration_id);
    if (!registration) continue;
    const participant = participantById.get(registration.participant_id);
    // An erasure-requested participant must never be chased.
    if (!participant || participant.deleted_at) continue;
    const batch = batchById.get(registration.batch_id);
    if (!batch) continue;
    debtors.push({
      registrationId: payment.registration_id,
      participantName: participant.full_name,
      courseName: courseNameById.get(batch.course_id) ?? '',
      cohortLabel: batch.cohort_label,
      batchStartDate: batch.start_date,
      courseFee: Number(payment.course_fee),
      amountPaid: Number(payment.amount_paid),
      balance: Number(payment.balance),
      paymentStatus: payment.payment_status,
      brokenPromiseDate: promiseByRegistration.get(payment.registration_id) ?? null,
      installmentDueDate: installmentByRegistration.get(payment.registration_id) ?? null,
    });
  }

  // Largest balances first — the money-weighted order a human collector uses.
  return debtors.sort((a, b) => b.balance - a.balance).slice(0, limit);
}

// Digest recipients: active admin + management staff.
export async function selectDigestRecipientEmails(): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('staff_users')
    .select('email, role, is_active')
    .in('role', ['admin', 'management'])
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((row) => row.email).filter(Boolean);
}

// Campaign-proposer context: what is open for sale.
export async function selectUpcomingBatches(): Promise<
  Array<{ courseName: string; cohortLabel: string; startDate: string; courseFee: number }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: batches, error } = await supabase
    .from('batches')
    .select('cohort_label, start_date, course_fee, course_id')
    .eq('is_active', true)
    .gte('start_date', todayIso)
    .order('start_date', { ascending: true })
    .limit(10);
  if (error) throw error;
  if (!batches || batches.length === 0) return [];
  const { data: courses } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', [...new Set(batches.map((batch) => batch.course_id))]);
  const nameById = new Map((courses ?? []).map((c) => [c.id, c.course_name]));
  return batches.map((batch) => ({
    courseName: nameById.get(batch.course_id) ?? '',
    cohortLabel: batch.cohort_label,
    startDate: batch.start_date,
    courseFee: Number(batch.course_fee),
  }));
}
