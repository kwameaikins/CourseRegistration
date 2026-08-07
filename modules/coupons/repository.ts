// Data access only — business rules live in service.ts (Document 11, Section 3).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { CreateCouponInput, UpdateCouponInput } from '@/modules/coupons/types';

export type CouponRow = Database['public']['Tables']['coupons']['Row'];
export type CouponRedemptionRow = Database['public']['Tables']['coupon_redemptions']['Row'];

// --- Staff-session reads/writes (RLS applies: admin+marketing manage, finance reads) ---

export async function selectCoupons(): Promise<CouponRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertCoupon(
  input: CreateCouponInput,
  createdByStaffId: string,
): Promise<CouponRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code: input.code,
      description: input.description ?? null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      applies_to_course_id: input.appliesToCourseId ?? null,
      max_uses: input.maxUses ?? null,
      one_per_participant: input.onePerParticipant,
      starts_at: input.startsAt ?? null,
      expires_at: input.expiresAt ?? null,
      created_by: createdByStaffId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCouponById(
  couponId: string,
  changes: UpdateCouponInput,
): Promise<CouponRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('coupons')
    .update({
      ...(changes.description !== undefined && { description: changes.description ?? null }),
      ...(changes.maxUses !== undefined && { max_uses: changes.maxUses ?? null }),
      ...(changes.expiresAt !== undefined && { expires_at: changes.expiresAt ?? null }),
      ...(changes.isActive !== undefined && { is_active: changes.isActive }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', couponId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectRedemptionCountsByCoupon(): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('coupon_redemptions').select('coupon_id');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.coupon_id, (counts.get(row.coupon_id) ?? 0) + 1);
  }
  return counts;
}

// --- System reads/writes ---
//
// Coupon lookup happens on the public registration form and in the student
// portal, where there is no staff session — and coupon_redemptions has no
// INSERT policy at all, so every write here goes through the service-role
// client. Authorization is performed by the callers (portal session ownership
// check, or usersService.requireRole on the staff path).

export async function selectCouponByCodeSystem(code: string): Promise<CouponRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectCouponByIdSystem(couponId: string): Promise<CouponRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('id', couponId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function countRedemptionsForCouponAndParticipantSystem(
  couponId: string,
  participantId: string,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', couponId)
    .eq('participant_id', participantId);
  if (error) throw error;
  return count ?? 0;
}

export async function selectRedemptionByRegistrationSystem(
  registrationId: string,
): Promise<CouponRedemptionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('coupon_redemptions')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertCouponRedemptionSystem(row: {
  coupon_id: string;
  registration_id: string;
  participant_id: string;
  discount_amount_applied: number;
  applied_at_stage: string;
  applied_by_staff_id: string | null;
}): Promise<CouponRedemptionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('coupon_redemptions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function incrementCouponUsesSystem(
  couponId: string,
  nextCount: number,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('coupons')
    .update({ uses_count: nextCount, updated_at: new Date().toISOString() })
    .eq('id', couponId);
  if (error) throw error;
}

// --- Attempt throttle ---

export async function countRecentAttemptsSystem(
  participantId: string,
  sinceIso: string,
): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('coupon_attempt_log')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', participantId)
    .gte('attempted_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

export async function insertFailedAttemptSystem(participantId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('coupon_attempt_log')
    .insert({ participant_id: participantId });
  if (error) throw error;
}
