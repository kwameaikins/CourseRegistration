// Data access only — business rules live in service.ts and
// paystack-webhook-handler.ts (Document 11, Section 3).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type PaymentRow = Database['public']['Tables']['payments']['Row'];
type PaymentSubmissionRow = Database['public']['Tables']['payment_submissions']['Row'];

export async function selectPaymentByRegistrationId(
  registrationId: string,
): Promise<PaymentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Staff payment update (session client — RLS permits finance/admin only).
// Only amount_paid and metadata are written; payment_status is derived by
// trigger (BR-04) and balance is a generated column (BR-05).
export async function updatePaymentByRegistrationId(
  registrationId: string,
  changes: {
    amount_paid: number;
    payment_method: PaymentRow['payment_method'];
    transaction_id?: string | null;
    payment_date?: string | null;
    payment_notes?: string | null;
    verified_by: string;
  },
): Promise<PaymentRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payments')
    .update(changes)
    .eq('registration_id', registrationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Staff discount/waiver write (session client — RLS permits finance/admin
// only, same policies that already cover the rest of this table).
export async function updatePaymentDiscount(
  registrationId: string,
  changes: {
    course_fee: number;
    original_fee: number;
    discount_amount: number;
    discount_reason: string;
    discount_granted_by: string;
    discount_granted_at: string;
  },
): Promise<PaymentRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payments')
    .update(changes)
    .eq('registration_id', registrationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Commission-credit-redemption write (service-role — the caller is a
// partner/tutor/student portal session, never a staff Supabase Auth
// session, so the RLS-gated session client above isn't reachable here).
export async function updatePaymentDiscountSystem(
  registrationId: string,
  changes: {
    course_fee: number;
    original_fee: number;
    discount_amount: number;
    discount_reason: string;
    discount_granted_by: string | null;
    discount_granted_at: string;
  },
): Promise<PaymentRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .update(changes)
    .eq('registration_id', registrationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Commission-credit redemption "toward a referred student" (2026-08-02) —
// resolves an email to their most recently registered course that still
// has an outstanding balance, since a partner redeeming credit on someone
// else's behalf won't know a raw registration id.
export async function selectMostRecentOpenRegistrationIdByEmailSystem(
  email: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (participantError) throw participantError;
  if (!participant) return null;

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, payments(balance)')
    .eq('participant_id', participant.id)
    .order('registered_at', { ascending: false });
  if (registrationsError) throw registrationsError;

  for (const registration of registrations ?? []) {
    const payment = Array.isArray(registration.payments) ? registration.payments[0] : registration.payments;
    if (payment && Number(payment.balance) > 0) {
      return registration.id;
    }
  }
  return null;
}

// --- Webhook path (service-role: authenticated by Paystack signature) ---

export async function selectPaymentByTransactionIdSystem(
  transactionId: string,
): Promise<Pick<PaymentRow, 'id'> | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Portal auto-login: resolves the Paystack checkout reference the browser
// generated (transaction_id) back to a registration + its current status,
// so the exchange endpoint can tell "not paid yet" apart from "no such
// reference" without needing the registrationId from the client.
export async function selectPaymentSummaryByTransactionIdSystem(
  transactionId: string,
): Promise<{ registrationId: string; paymentStatus: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .select('registration_id, payment_status')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { registrationId: data.registration_id, paymentStatus: data.payment_status };
}

// The batch and participant behind a registration — needed to validate a
// coupon (course scope) and to attribute its redemption.
export async function selectRegistrationContextSystem(
  registrationId: string,
): Promise<{ batchId: string; participantId: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registrations')
    .select('batch_id, participant_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data ? { batchId: data.batch_id, participantId: data.participant_id } : null;
}

export async function selectPaymentByRegistrationIdSystem(
  registrationId: string,
): Promise<PaymentRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function applyWebhookPaymentSystem(
  registrationId: string,
  changes: {
    amount_paid: number;
    payment_method: PaymentRow['payment_method'];
    transaction_id: string;
    payment_date: string;
  },
): Promise<PaymentRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .update(changes)
    .eq('registration_id', registrationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Payment installments (founder-approved 2026-07-24) ---
// Service-role throughout: written from the portal (participant, no staff
// session) and from the webhook/manual-payment reconciliation step (system
// context, not itself a staff action — the staff action already completed
// under its own role check by the time reconciliation runs).

type InstallmentRow = Database['public']['Tables']['payment_installments']['Row'];

export async function selectInstallmentCountForRegistration(
  registrationId: string,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('payment_installments')
    .select('id', { count: 'exact', head: true })
    .eq('registration_id', registrationId);
  if (error) throw error;
  return count ?? 0;
}

export async function insertInstallments(
  rows: Array<{
    payment_id: string;
    registration_id: string;
    installment_number: number;
    amount_due: number;
    due_date: string;
  }>,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('payment_installments').insert(rows);
  if (error) throw error;
}

export async function selectInstallmentsForRegistration(
  registrationId: string,
): Promise<InstallmentRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payment_installments')
    .select('*')
    .eq('registration_id', registrationId)
    .order('installment_number', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateInstallmentAmountPaid(id: string, amountPaid: number): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('payment_installments')
    .update({ amount_paid: amountPaid })
    .eq('id', id);
  if (error) throw error;
}

// Discount rebalancing (fixes the known limitation flagged in PLAN.md) — a
// staff discount changes the aggregate course_fee after installment amounts
// were already fixed; this updates amount_due to match. The
// fn_derive_installment_status trigger re-evaluates payment_status/paid_at
// automatically on this write, same as an amount_paid change.
export async function updateInstallmentAmountDue(id: string, amountDue: number): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('payment_installments')
    .update({ amount_due: amountDue })
    .eq('id', id);
  if (error) throw error;
}

// Reminder candidates (daily cron) — specifically the second installment:
// the first is due the day the plan is set up, so reminding about it moments
// later would be noise. Still-Pending rows due within `withinDays` (or
// already overdue) — BR-07's email_log unique(registration_id, email_type)
// makes re-running this safe without a separate installment-level dedup.
export async function selectDueSecondInstallments(
  withinDays: number,
): Promise<Array<{ registration_id: string; amount_due: number; due_date: string }>> {
  const supabase = createSupabaseServiceRoleClient();
  const thresholdIso = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from('payment_installments')
    .select('registration_id, amount_due, due_date')
    .eq('installment_number', 2)
    .eq('payment_status', 'Pending')
    .lte('due_date', thresholdIso);
  if (error) throw error;
  return data ?? [];
}

// --- Payment submissions (founder-requested 2026-08-01) ---
// Submit path is service-role (portal, no staff session, gated by
// modules/portal's own ownership check before the insert). Review/list path
// is the session client — RLS restricts payment_submissions to finance/admin
// (migration 202608010043), same posture as updatePaymentByRegistrationId.

export async function selectPendingPaymentSubmissionForRegistration(
  registrationId: string,
): Promise<PaymentSubmissionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payment_submissions')
    .select('*')
    .eq('registration_id', registrationId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertPaymentSubmissionSystem(row: {
  registration_id: string;
  method: string;
  amount: number;
  transaction_reference: string | null;
  payment_date: string;
  slip_file_path: string | null;
  participant_notes: string | null;
}): Promise<PaymentSubmissionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payment_submissions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Portal's own submission history for one registration (own-history view,
// not the staff queue) — service-role, same reasoning as the insert above.
export async function selectPaymentSubmissionsForRegistrationSystem(
  registrationId: string,
): Promise<PaymentSubmissionRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payment_submissions')
    .select('*')
    .eq('registration_id', registrationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectPaymentSubmissions(filters?: {
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<PaymentSubmissionRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('payment_submissions').select('*');
  if (filters?.status) query = query.eq('status', filters.status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectPaymentSubmissionById(
  id: string,
): Promise<PaymentSubmissionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payment_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePaymentSubmission(
  id: string,
  changes: {
    status: 'approved' | 'rejected';
    reviewed_by: string;
    reviewed_at: string;
    review_note: string | null;
  },
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('payment_submissions').update(changes).eq('id', id);
  if (error) throw error;
}

// Participant/course context for the staff queue view — same
// registrations(participants(...)) embedded-select pattern as
// modules/attendance/repository.ts's selectParticipantInfoForRegistrations.
export async function selectPaymentSubmissionContext(
  registrationIds: string[],
): Promise<Map<string, { participantName: string; courseName: string; cohortLabel: string }>> {
  if (registrationIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('registrations')
    .select('id, participants(full_name), batches(cohort_label, courses(course_name))')
    .in('id', registrationIds);
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => {
      const participant = Array.isArray(r.participants) ? r.participants[0] : r.participants;
      const batch = Array.isArray(r.batches) ? r.batches[0] : r.batches;
      const course = batch ? (Array.isArray(batch.courses) ? batch.courses[0] : batch.courses) : null;
      return [
        r.id,
        {
          participantName: (participant as { full_name?: string } | null)?.full_name ?? '',
          courseName: (course as { course_name?: string } | null)?.course_name ?? '',
          cohortLabel: (batch as { cohort_label?: string } | null)?.cohort_label ?? '',
        },
      ];
    }),
  );
}
