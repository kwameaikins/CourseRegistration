// Data access only — business rules live in service.ts (Document 11, Section 3).
//
// Most reads here run on the service-role client. Access is evaluated in the
// student portal (no staff session, and no Supabase Auth identity to evaluate
// RLS against) and in the daily cron, exactly like the payments and
// communications repositories. The staff-session variants exist for the
// screens where RLS should apply.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

export type AccessGrantRow =
  Database['public']['Tables']['registration_access_grants']['Row'];

// --- System reads ---

// Live grants for a set of registrations, newest expiry first per
// registration. "Live" means not revoked; whether it has EXPIRED is decided
// by the caller against today's date, so the expiry sweep can find grants
// that have just lapsed using the same query the gates use.
export async function selectLiveGrantsForRegistrationsSystem(
  registrationIds: string[],
): Promise<AccessGrantRow[]> {
  if (registrationIds.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registration_access_grants')
    .select('*')
    .in('registration_id', registrationIds)
    .is('revoked_at', null)
    .order('expires_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectGrantHistoryForRegistrationSystem(
  registrationId: string,
): Promise<AccessGrantRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registration_access_grants')
    .select('*')
    .eq('registration_id', registrationId)
    .order('granted_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Every registration whose access is still nominally open (not revoked, not
// yet swept). The cron narrows this to "expired" or "expiring" in memory —
// the population is small (unsettled balances only) and doing the date
// arithmetic in one place beats two near-identical SQL predicates.
export async function selectUnrevokedGrantsSystem(): Promise<AccessGrantRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registration_access_grants')
    .select('*')
    .is('revoked_at', null)
    .order('expires_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertGrantSystem(row: {
  registration_id: string;
  reason: string;
  expires_on: string;
  note: string;
  granted_by: string | null;
}): Promise<AccessGrantRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registration_access_grants')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Revokes every live grant on a registration in one write. Used both by the
// staff revoke action and by the expiry sweep (which closes lapsed rows so
// they stop being reconsidered every night).
export async function revokeLiveGrantsSystem(
  registrationId: string,
  revokedByStaffId: string | null,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registration_access_grants')
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedByStaffId })
    .eq('registration_id', registrationId)
    .is('revoked_at', null)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// --- Registration status ---
//
// A grant advances the Registration to 'Confirmed' so the tutor roster,
// headcount and class-reminder queries keep working untouched — all three
// read registration_status alone, and selectRosterForBatchSystem
// deliberately never joins payments at all. Coupling those to a payment-
// adjacent predicate would undo that.
//
// The money-sensitive gates (the portal's Zoom and resources links, the Next
// Class join button) do NOT rely on this column — they re-derive access from
// the grant's date at read time, so a failed sweep can never leak a join link
// past expiry. This column lagging by a night only ever means a tutor sees an
// extra name on a roster.

export async function confirmRegistrationSystem(registrationId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('registrations')
    .update({ registration_status: 'Confirmed', updated_at: new Date().toISOString() })
    .eq('id', registrationId)
    .eq('registration_status', 'Registered');
  if (error) throw error;
}

// Walks a granted seat back. Guarded on 'Confirmed' so it can never touch a
// Cancelled or Attended registration; the caller has already established that
// the payment is not settled.
export async function unconfirmRegistrationSystem(registrationId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('registrations')
    .update({ registration_status: 'Registered', updated_at: new Date().toISOString() })
    .eq('id', registrationId)
    .eq('registration_status', 'Confirmed');
  if (error) throw error;
}

// --- Payment context ---
//
// Read here rather than through paymentsService to keep the dependency
// pointing one way: payments calls into access-grants (the auto-grant on part
// payment), never the reverse.

export async function selectPaymentContextSystem(registrationId: string): Promise<{
  paymentStatus: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  batchIsFree: boolean;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: payment, error } = await supabase
    .from('payments')
    .select('payment_status, course_fee, amount_paid, balance')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return null;

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('batch_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (registrationError) throw registrationError;

  let batchIsFree = false;
  if (registration) {
    const { data: batch, error: batchError } = await supabase
      .from('batches')
      .select('is_free')
      .eq('id', registration.batch_id)
      .maybeSingle();
    if (batchError) throw batchError;
    batchIsFree = batch?.is_free ?? false;
  }

  return {
    paymentStatus: payment.payment_status,
    courseFee: Number(payment.course_fee),
    amountPaid: Number(payment.amount_paid),
    balance: Number(payment.balance),
    batchIsFree,
  };
}

export async function selectSettledRegistrationIdsSystem(
  registrationIds: string[],
): Promise<Set<string>> {
  if (registrationIds.length === 0) return new Set();
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .select('registration_id')
    .in('registration_id', registrationIds)
    .eq('payment_status', 'Paid');
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.registration_id));
}

// --- Zoom registrant (expiry sweep) ---

export async function selectZoomRegistrantForRevocationSystem(
  registrationId: string,
): Promise<{ zoom_registrant_id: string; meeting_id: string; email: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrant, error } = await supabase
    .from('zoom_registrants')
    .select('zoom_registrant_id, registration_id')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!registrant) return null;

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('batch_id, participant_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (registrationError) throw registrationError;
  if (!registration) return null;

  const [{ data: batch, error: batchError }, { data: participant, error: participantError }] =
    await Promise.all([
      supabase
        .from('batches')
        .select('zoom_meeting_id')
        .eq('id', registration.batch_id)
        .maybeSingle(),
      supabase
        .from('participants')
        .select('email')
        .eq('id', registration.participant_id)
        .maybeSingle(),
    ]);
  if (batchError) throw batchError;
  if (participantError) throw participantError;
  if (!batch?.zoom_meeting_id || !participant?.email) return null;

  return {
    zoom_registrant_id: registrant.zoom_registrant_id,
    meeting_id: batch.zoom_meeting_id,
    email: participant.email,
  };
}

// --- Staff-session reads (RLS applies: admin + finance only) ---

export async function selectGrantHistoryForRegistration(
  registrationId: string,
): Promise<AccessGrantRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('registration_access_grants')
    .select('*')
    .eq('registration_id', registrationId)
    .order('granted_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectStaffNamesByIds(
  staffIds: string[],
): Promise<Map<string, string>> {
  if (staffIds.length === 0) return new Map();
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('staff_users')
    .select('id, full_name')
    .in('id', staffIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}
