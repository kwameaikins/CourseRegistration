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
