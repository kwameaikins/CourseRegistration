// Data access only — business rules live in service.ts (Document 11,
// Section 3). companies/company_batch_allocations use the session client
// (RLS-gated to staff roles); company_admin_auth/company_admin_sessions use
// the service-role client exclusively, same posture as modules/portal
// (participant_auth/participant_sessions) — see the migration header.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { CreateCompanyInput, CreateSeatAllocationInput } from '@/modules/corporate/types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type AllocationRow = Database['public']['Tables']['company_batch_allocations']['Row'];
type RegistrationRow = Database['public']['Tables']['registrations']['Row'];
type ParticipantRow = Database['public']['Tables']['participants']['Row'];
type PaymentRow = Database['public']['Tables']['payments']['Row'];

export async function insertCompany(
  input: CreateCompanyInput,
  createdBy: string | null,
): Promise<CompanyRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: input.name,
      tin: input.tin ?? null,
      billing_contact_name: input.billingContactName,
      billing_email: input.billingEmail,
      billing_phone: input.billingPhone,
      billing_address: input.billingAddress ?? null,
      notes: input.notes ?? null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectCompanies(): Promise<CompanyRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectCompanyById(id: string): Promise<CompanyRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// System-context read (no staff session) — used by the company portal auth
// flow, which authenticates by billing_email before any staff session exists.
export async function selectCompanyByEmailSystem(email: string): Promise<CompanyRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('billing_email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectCompanyByIdSystem(id: string): Promise<CompanyRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertAllocation(
  input: CreateSeatAllocationInput,
  createdBy: string | null,
): Promise<AllocationRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('company_batch_allocations')
    .insert({
      company_id: input.companyId,
      batch_id: input.batchId,
      seats_purchased: input.seatsPurchased,
      price_per_seat: input.pricePerSeat,
      notes: input.notes ?? null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectAllocationById(id: string): Promise<AllocationRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('company_batch_allocations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// System-context read — used inside registerOneParticipant's caller
// (modules/corporate/service.ts) after the staff/portal session has already
// been verified, so a plain service-role lookup is fine here.
export async function selectAllocationByIdSystem(id: string): Promise<AllocationRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('company_batch_allocations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectAllocationsForCompany(companyId: string): Promise<AllocationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('company_batch_allocations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateAllocation(
  id: string,
  changes: { status?: string; status_reason?: string | null },
): Promise<AllocationRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('company_batch_allocations')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Roster for one allocation — two-step fetch + in-memory join (same pattern
// as modules/waitlist/repository.ts's selectWaitlistForBatchStaff), used by
// both the staff allocation-detail screen and the company portal.
export async function selectRegistrationsForAllocationSystem(allocationId: string): Promise<
  Array<{
    registration: RegistrationRow;
    participant: ParticipantRow | null;
    payment: PaymentRow | null;
  }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('company_allocation_id', allocationId)
    .order('registered_at', { ascending: true });
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const participantIds = [...new Set(registrations.map((row) => row.participant_id))];
  const registrationIds = registrations.map((row) => row.id);

  const [{ data: participants, error: participantsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase.from('participants').select('*').in('id', participantIds),
      supabase.from('payments').select('*').in('registration_id', registrationIds),
    ]);
  if (participantsError) throw participantsError;
  if (paymentsError) throw paymentsError;

  const participantById = new Map((participants ?? []).map((row) => [row.id, row]));
  const paymentByRegistrationId = new Map((payments ?? []).map((row) => [row.registration_id, row]));

  return registrations.map((registration) => ({
    registration,
    participant: participantById.get(registration.participant_id) ?? null,
    payment: paymentByRegistrationId.get(registration.id) ?? null,
  }));
}

export async function countRegistrationsForAllocationSystem(allocationId: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('company_allocation_id', allocationId);
  if (error) throw error;
  return count ?? 0;
}

// --- Company admin portal auth (mirrors modules/portal/repository.ts's
// participant_auth/participant_sessions exactly — service-role only). ---

type CompanyAdminAuthRow = Database['public']['Tables']['company_admin_auth']['Row'];
type CompanyAdminSessionRow = Database['public']['Tables']['company_admin_sessions']['Row'];

export async function selectCompanyAuth(companyId: string): Promise<CompanyAdminAuthRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('company_admin_auth')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertCompanyAuthIfMissing(companyId: string, pinHash: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('company_admin_auth')
    .upsert(
      { company_id: companyId, pin_hash: pinHash, must_change_pin: true },
      { onConflict: 'company_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function recordFailedCompanyLogin(
  companyId: string,
  changes: { failed_attempts: number; locked_until: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('company_admin_auth')
    .update(changes)
    .eq('company_id', companyId);
  if (error) throw error;
}

export async function recordSuccessfulCompanyLogin(companyId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('company_admin_auth')
    .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq('company_id', companyId);
  if (error) throw error;
}

export async function updateCompanyPin(companyId: string, pinHash: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('company_admin_auth')
    .update({ pin_hash: pinHash, must_change_pin: false })
    .eq('company_id', companyId);
  if (error) throw error;
}

export async function insertCompanySession(
  companyId: string,
  expiresAt: string,
): Promise<CompanyAdminSessionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('company_admin_sessions')
    .insert({ company_id: companyId, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectCompanySession(sessionId: string): Promise<CompanyAdminSessionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('company_admin_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function revokeCompanySession(sessionId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('company_admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

// --- Dashboard summary (Phase 3) — deliberately lightweight/aggregate-only
// reads, not per-allocation rollups, since this feeds a single summary
// card, not a detail screen. ---

export async function countCompaniesSystem(): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase.from('companies').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function selectAllAllocationsSystem(): Promise<AllocationRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('company_batch_allocations').select('*');
  if (error) throw error;
  return data ?? [];
}

// Every registration ever tagged with a company_allocation_id, plus its
// payment row's course_fee/amount_paid — used to compute seats filled and
// invoiced/settled totals across ALL companies in one pass.
export async function selectCorporateRegistrationTotalsSystem(): Promise<
  Array<{ companyAllocationId: string; courseFee: number; amountPaid: number }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id, company_allocation_id')
    .not('company_allocation_id', 'is', null);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const registrationIds = registrations.map((row) => row.id);
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, course_fee, amount_paid')
    .in('registration_id', registrationIds);
  if (paymentsError) throw paymentsError;

  const paymentByRegistrationId = new Map((payments ?? []).map((row) => [row.registration_id, row]));
  return registrations
    .filter((row): row is typeof row & { company_allocation_id: string } => row.company_allocation_id !== null)
    .map((row) => {
      const payment = paymentByRegistrationId.get(row.id);
      return {
        companyAllocationId: row.company_allocation_id,
        courseFee: payment ? Number(payment.course_fee) : 0,
        amountPaid: payment ? Number(payment.amount_paid) : 0,
      };
    });
}
