// Data access only — business rules live in service.ts. partners/codes/
// code_redemptions/partner_link_clicks/partner_commissions/partner_payouts
// use the session client (RLS-gated to staff roles) for staff-facing reads/
// writes; partner_auth/partner_sessions use the service-role client
// exclusively (same posture as modules/portal/modules/corporate), and a
// handful of "System" functions use service-role for the unauthenticated
// public paths (application form, code redemption at registration, the
// tracked-link redirect, commission accrual on payment).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type {
  CreateCodeInput,
  CreatePartnerInput,
  PartnerApplicationInput,
} from '@/modules/partners/types';

type PartnerRow = Database['public']['Tables']['partners']['Row'];
type PartnerAuthRow = Database['public']['Tables']['partner_auth']['Row'];
type PartnerSessionRow = Database['public']['Tables']['partner_sessions']['Row'];
type CodeRow = Database['public']['Tables']['codes']['Row'];
type CodeRedemptionRow = Database['public']['Tables']['code_redemptions']['Row'];
type PartnerCommissionRow = Database['public']['Tables']['partner_commissions']['Row'];
type PartnerPayoutRow = Database['public']['Tables']['partner_payouts']['Row'];

// --- Partners: staff-facing (session client, RLS) ---

export async function insertPartner(
  input: CreatePartnerInput,
  createdBy: string,
): Promise<PartnerRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('partners')
    .insert({
      category: input.category,
      full_name: input.fullName,
      email: input.email ?? null,
      phone: input.phone,
      company_name: input.companyName ?? null,
      tutor_id: input.tutorId ?? null,
      commission_rate: input.commissionRate ?? null,
      payout_method: input.payoutMethod ?? null,
      payout_details: input.payoutDetails ?? null,
      status: 'active',
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectPartners(filters?: {
  status?: string;
  category?: string;
}): Promise<PartnerRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('partners').select('*');
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.category) query = query.eq('category', filters.category);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectPartnerById(id: string): Promise<PartnerRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('partners').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePartnerFields(
  id: string,
  changes: Database['public']['Tables']['partners']['Update'],
): Promise<PartnerRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('partners')
    .update(changes)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approvePartner(
  id: string,
  reviewedBy: string,
): Promise<PartnerRow> {
  return updatePartnerFields(id, {
    status: 'active',
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
  });
}

export async function rejectPartner(id: string, reviewedBy: string): Promise<PartnerRow> {
  return updatePartnerFields(id, {
    status: 'rejected',
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
  });
}

// --- Partners: system/unauthenticated (service-role) ---

export async function insertPartnerApplicationSystem(
  input: PartnerApplicationInput,
): Promise<PartnerRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partners')
    .insert({
      category: input.category,
      full_name: input.fullName,
      email: input.email ?? null,
      phone: input.phone,
      company_name: input.companyName ?? null,
      social_links: input.socialLinks ?? null,
      professional_background: input.professionalBackground ?? null,
      promotional_methods: input.promotionalMethods ?? null,
      estimated_audience_size: input.estimatedAudienceSize ?? null,
      payout_method: input.payoutMethod ?? null,
      payout_details: input.payoutDetails ?? null,
      agreed_to_code_of_conduct: input.agreedToCodeOfConduct,
      status: 'pending',
      created_by: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectPartnerByIdSystem(id: string): Promise<PartnerRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('partners').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectPartnerByPhoneSystem(phone: string): Promise<PartnerRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('phone', phone)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectPartnerByTutorIdSystem(tutorId: string): Promise<PartnerRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// --- Partner portal auth (mirrors company_admin_auth/company_admin_sessions
// exactly — service-role only, only ever populated for non-tutor categories) ---

export async function selectPartnerAuth(partnerId: string): Promise<PartnerAuthRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_auth')
    .select('*')
    .eq('partner_id', partnerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertPartnerAuthIfMissing(partnerId: string, pinHash: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('partner_auth')
    .upsert(
      { partner_id: partnerId, pin_hash: pinHash, must_change_pin: true },
      { onConflict: 'partner_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function recordFailedPartnerLogin(
  partnerId: string,
  changes: { failed_attempts: number; locked_until: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('partner_auth').update(changes).eq('partner_id', partnerId);
  if (error) throw error;
}

export async function recordSuccessfulPartnerLogin(partnerId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('partner_auth')
    .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq('partner_id', partnerId);
  if (error) throw error;
}

export async function updatePartnerPin(partnerId: string, pinHash: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('partner_auth')
    .update({ pin_hash: pinHash, must_change_pin: false })
    .eq('partner_id', partnerId);
  if (error) throw error;
}

export async function insertPartnerSession(
  partnerId: string,
  expiresAt: string,
): Promise<PartnerSessionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_sessions')
    .insert({ partner_id: partnerId, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectPartnerSession(sessionId: string): Promise<PartnerSessionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function revokePartnerSession(sessionId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('partner_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

// --- Codes ---

export async function insertCode(input: CreateCodeInput, createdBy: string): Promise<CodeRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('codes')
    .insert({
      code: input.code.toUpperCase(),
      partner_id: input.partnerId ?? null,
      discount_type: input.discountType ?? null,
      discount_value: input.discountValue ?? null,
      applies_to_course_id: input.appliesToCourseId ?? null,
      max_uses: input.maxUses ?? null,
      one_per_participant: input.onePerParticipant,
      expires_at: input.expiresAt ?? null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectCodes(filters?: { partnerId?: string }): Promise<CodeRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('codes').select('*');
  if (filters?.partnerId) query = query.eq('partner_id', filters.partnerId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deactivateCode(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('codes').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// System reads (code lookup happens at public registration time, no staff session).
export async function selectCodeByCodeSystem(code: string): Promise<CodeRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectCodeByIdSystem(id: string): Promise<CodeRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('codes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function incrementCodeUsesSystem(id: string, nextCount: number): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('codes').update({ uses_count: nextCount }).eq('id', id);
  if (error) throw error;
}

export async function selectCodesForPartnerSystem(partnerId: string): Promise<CodeRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('codes')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// --- Code redemptions ---

export async function insertCodeRedemptionSystem(row: {
  code_id: string;
  registration_id: string;
  participant_id: string;
  discount_amount_applied: number;
  attribution_method: string;
  existing_lead_at_redemption: boolean;
  self_referral_at_redemption: boolean;
}): Promise<CodeRedemptionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('code_redemptions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectRedemptionByRegistrationSystem(
  registrationId: string,
): Promise<CodeRedemptionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('code_redemptions')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function countRedemptionsForCodeAndParticipantSystem(
  codeId: string,
  participantId: string,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('code_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('code_id', codeId)
    .eq('participant_id', participantId);
  if (error) throw error;
  return count ?? 0;
}

export async function selectRedemptionsForCodesSystem(codeIds: string[]): Promise<CodeRedemptionRow[]> {
  if (codeIds.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('code_redemptions')
    .select('*')
    .in('code_id', codeIds);
  if (error) throw error;
  return data ?? [];
}

// --- Link clicks ---

export async function insertLinkClickSystem(codeId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('partner_link_clicks').insert({ code_id: codeId });
  if (error) throw error;
}

export async function countClicksForCodesSystem(codeIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (codeIds.length === 0) return counts;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_link_clicks')
    .select('code_id')
    .in('code_id', codeIds);
  if (error) throw error;
  for (const row of data ?? []) {
    counts.set(row.code_id, (counts.get(row.code_id) ?? 0) + 1);
  }
  return counts;
}

// --- Commissions ---

export async function insertCommissionSystem(row: {
  partner_id: string;
  registration_id: string;
  code_redemption_id: string;
  commission_amount: number;
  qualifies_at: string;
}): Promise<PartnerCommissionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_commissions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectCommissionByRegistrationSystem(
  registrationId: string,
): Promise<PartnerCommissionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_commissions')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Trailing-window paid-enrolment count for tier lookup — counts commission
// rows already created for this partner (i.e. registrations that actually
// converted to Paid and earned consideration), not raw redemptions.
export async function countCommissionsForPartnerSinceSystem(
  partnerId: string,
  sinceIso: string,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('partner_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerId)
    .gte('created_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

// Staff queue read (session client, RLS: finance/admin).
export async function selectCommissions(filters?: {
  status?: string;
  partnerId?: string;
}): Promise<PartnerCommissionRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('partner_commissions').select('*');
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.partnerId) query = query.eq('partner_id', filters.partnerId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectCommissionById(id: string): Promise<PartnerCommissionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('partner_commissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Cron path — service-role, no staff session.
export async function selectPendingCommissionsDueSystem(todayIso: string): Promise<PartnerCommissionRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_commissions')
    .select('*')
    .eq('status', 'pending')
    .lte('qualifies_at', todayIso);
  if (error) throw error;
  return data ?? [];
}

export async function updateCommissionStatus(
  id: string,
  changes: Database['public']['Tables']['partner_commissions']['Update'],
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('partner_commissions').update(changes).eq('id', id);
  if (error) throw error;
}

// Used by the cron (service-role) for the pending -> approved flip.
export async function updateCommissionStatusSystem(
  id: string,
  changes: Database['public']['Tables']['partner_commissions']['Update'],
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('partner_commissions').update(changes).eq('id', id);
  if (error) throw error;
}

// --- Payouts ---

export async function insertPayout(row: {
  partner_id: string;
  total_amount: number;
  method: string;
  reference: string | null;
}): Promise<PartnerPayoutRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('partner_payouts').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function selectPayoutsForPartner(partnerId: string): Promise<PartnerPayoutRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('partner_payouts')
    .select('*')
    .eq('partner_id', partnerId)
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectPayoutsForPartnerSystem(partnerId: string): Promise<PartnerPayoutRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_payouts')
    .select('*')
    .eq('partner_id', partnerId)
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectBatchStartDateForRegistrationSystem(
  registrationId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('batch_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (registrationError) throw registrationError;
  if (!registration) return null;
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('start_date')
    .eq('id', registration.batch_id)
    .maybeSingle();
  if (batchError) throw batchError;
  return batch?.start_date ?? null;
}

// --- Existing-tutor/existing-student self-serve auto-provisioning
// (founder-requested 2026-08-02, same-day follow-up) ---

export async function selectPartnerByParticipantIdSystem(participantId: string): Promise<PartnerRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('participant_id', participantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Every tutor automatically has affiliate capability through their existing
// tutor account (doc's own stated intent) — never gets a partner_auth row,
// same as staff-created tutor partners.
export async function insertTutorPartnerSystem(params: {
  tutorId: string;
  fullName: string;
  phone: string;
  email: string | null;
}): Promise<PartnerRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partners')
    .insert({
      category: 'tutor',
      full_name: params.fullName,
      email: params.email,
      phone: params.phone,
      tutor_id: params.tutorId,
      status: 'active',
      agreed_to_code_of_conduct: true,
      created_by: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// An existing student self-serving "Refer & Earn" from their own portal —
// auto-approved, no partner_auth row (they manage it from the student
// portal they already have, same posture as tutor_id above).
export async function insertAmbassadorPartnerForParticipantSystem(params: {
  participantId: string;
  fullName: string;
  phone: string;
  email: string | null;
}): Promise<PartnerRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partners')
    .insert({
      category: 'ambassador',
      full_name: params.fullName,
      email: params.email,
      phone: params.phone,
      participant_id: params.participantId,
      status: 'active',
      agreed_to_code_of_conduct: true,
      created_by: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertCodeSystem(row: { code: string; partner_id: string }): Promise<CodeRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('codes')
    .insert({ code: row.code, partner_id: row.partner_id, one_per_participant: true, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Commission credit redemption (service-role — the caller is a partner/
// tutor/student portal session, never a staff session) ---

export async function selectCommissionByIdSystem(id: string): Promise<PartnerCommissionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('partner_commissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// --- Context join for the staff commissions queue (participant/course/batch) ---

export async function selectCommissionContextSystem(
  registrationIds: string[],
): Promise<Map<string, { participantName: string; courseName: string; cohortLabel: string }>> {
  if (registrationIds.length === 0) return new Map();
  const supabase = createSupabaseServiceRoleClient();
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
