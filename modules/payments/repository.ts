// Data access only — business rules live in service.ts and
// paystack-webhook-handler.ts (Document 11, Section 3).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type PaymentRow = Database['public']['Tables']['payments']['Row'];

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
