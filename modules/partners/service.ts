// Knowsia Growth Partner Programme business rules (founder-requested
// 2026-08-02, per Coding Docs/knowsia_growth_partner_programme.md).
import QRCode from 'qrcode';
import { hashPin, lastFourDigits, verifyPin } from '@/lib/portal-auth/pin';
import { AppError } from '@/lib/errors';
import * as partnersRepository from '@/modules/partners/repository';
import * as usersService from '@/modules/users/service';
// Permitted cross-module call, same posture as every other module reaching
// into courses for a read-only batch/course lookup (e.g. modules/payments,
// modules/registrations).
import * as coursesService from '@/modules/courses/service';
import type {
  Code,
  CodePreview,
  CommissionStatus,
  CreateCodeInput,
  CreatePartnerInput,
  Partner,
  PartnerApplicationInput,
  PartnerCategory,
  PartnerCommission,
  PartnerCommissionView,
  PartnerPayout,
  PartnerPortalDashboard,
  PartnerPortalLoginInput,
  PartnerPortalLoginResult,
  PartnerPortalChangePinInput,
  PartnerReferralSummary,
  RecordPayoutInput,
  UpdatePartnerInput,
} from '@/modules/partners/types';
import type { Database } from '@/lib/supabase/database.types';

const STAFF_MANAGE_ROLES = ['admin', 'marketing'] as const;
const STAFF_FINANCE_ROLES = ['finance', 'admin'] as const;

// Doc SS4: minimum balance before a payout is worth processing — a soft
// warning at record-payout time, never a hard block (founder may still
// want to close out a small final balance).
export const MINIMUM_PAYOUT_BALANCE = 100;

// Doc SS3: 14-day hold, reconciled with the batch-start risk window —
// whichever is later.
const COMMISSION_HOLD_DAYS = 14;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type PartnerRow = Database['public']['Tables']['partners']['Row'];
type CodeRow = Database['public']['Tables']['codes']['Row'];
type CommissionRow = Database['public']['Tables']['partner_commissions']['Row'];
type PayoutRow = Database['public']['Tables']['partner_payouts']['Row'];

function toPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    category: row.category as PartnerCategory,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    companyName: row.company_name,
    tutorId: row.tutor_id,
    participantId: row.participant_id,
    commissionRate: row.commission_rate !== null ? Number(row.commission_rate) : null,
    payoutMethod: row.payout_method as Partner['payoutMethod'],
    payoutDetails: row.payout_details,
    status: row.status as Partner['status'],
    socialLinks: row.social_links,
    professionalBackground: row.professional_background,
    promotionalMethods: row.promotional_methods,
    estimatedAudienceSize: row.estimated_audience_size,
    agreedToCodeOfConduct: row.agreed_to_code_of_conduct,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCode(row: CodeRow): Code {
  return {
    id: row.id,
    code: row.code,
    partnerId: row.partner_id,
    discountType: row.discount_type as Code['discountType'],
    discountValue: row.discount_value !== null ? Number(row.discount_value) : null,
    appliesToCourseId: row.applies_to_course_id,
    maxUses: row.max_uses,
    usesCount: row.uses_count,
    onePerParticipant: row.one_per_participant,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function toCommission(row: CommissionRow): PartnerCommission {
  return {
    id: row.id,
    partnerId: row.partner_id,
    registrationId: row.registration_id,
    codeRedemptionId: row.code_redemption_id,
    commissionAmount: Number(row.commission_amount),
    status: row.status as CommissionStatus,
    qualifiesAt: row.qualifies_at,
    payoutId: row.payout_id,
    paidAt: row.paid_at,
    clawbackReason: row.clawback_reason,
    redeemedAgainstRegistrationId: row.redeemed_against_registration_id,
    createdAt: row.created_at,
  };
}

function toPayout(row: PayoutRow): PartnerPayout {
  return {
    id: row.id,
    partnerId: row.partner_id,
    totalAmount: Number(row.total_amount),
    method: row.method,
    reference: row.reference,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    paidAt: row.paid_at,
  };
}

// --- Commission rate lookup (doc SS2 tiers) — pure functions, unit-testable
// in isolation from any database access. ---

export function ambassadorRate(monthlyPaidCount: number): number {
  if (monthlyPaidCount >= 30) return 18;
  if (monthlyPaidCount >= 10) return 15;
  return 12;
}

export function institutionalFlatFee(annualPaidCount: number): number {
  if (annualPaidCount >= 200) return 50;
  if (annualPaidCount >= 50) return 40;
  return 30;
}

// Tutor Partners: fixed 10% of the first payment (doc SSB) — no tiering.
// Subscription-renewal commissions are explicitly out of scope (no
// subscription/recurring-billing product exists in this codebase).
const TUTOR_COMMISSION_RATE = 10;

async function computeCommissionAmount(
  partner: PartnerRow,
  amountPaid: number,
): Promise<number | null> {
  // Nothing was collected, so there is nothing to commission on — a free
  // event/webinar, a 100% code discount, or a fully-waived fee. This guard is
  // NOT redundant: the institutional branch below returns a FLAT GHS 30-50
  // that never looks at amountPaid, so without it a free signup would pay a
  // real cash commission. Every other tier multiplies by amountPaid and would
  // already yield zero. Free events still record their referral attribution
  // (registrations/service.ts calls redeemCodeSystem regardless) — they just
  // never earn.
  if (amountPaid <= 0) {
    return 0;
  }
  if (partner.category === 'ambassador') {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const monthlyCount = await partnersRepository.countCommissionsForPartnerSinceSystem(
      partner.id,
      since.toISOString(),
    );
    return round2(amountPaid * (ambassadorRate(monthlyCount) / 100));
  }
  if (partner.category === 'tutor') {
    return round2(amountPaid * (TUTOR_COMMISSION_RATE / 100));
  }
  if (partner.category === 'institutional') {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const annualCount = await partnersRepository.countCommissionsForPartnerSinceSystem(
      partner.id,
      since.toISOString(),
    );
    return institutionalFlatFee(annualCount);
  }
  // strategic: only if a manual rate was negotiated; otherwise no automatic
  // commission (doc SSD — "should not be placed under the normal affiliate
  // commission table").
  if (partner.commission_rate !== null) {
    return round2(amountPaid * (Number(partner.commission_rate) / 100));
  }
  return null;
}

// --- Public application (doc SS5) ---

export async function submitPartnerApplication(input: PartnerApplicationInput): Promise<Partner> {
  const row = await partnersRepository.insertPartnerApplicationSystem(input);
  return toPartner(row);
}

// --- Staff management ---

export async function listPartners(filters?: {
  status?: string;
  category?: string;
}): Promise<Partner[]> {
  await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  const rows = await partnersRepository.selectPartners(filters);
  return rows.map(toPartner);
}

export async function createPartner(input: CreatePartnerInput): Promise<Partner> {
  const staffUser = await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  if (input.category === 'tutor' && !input.tutorId) {
    throw new AppError('VALIDATION_ERROR', 'A Tutor Partner must be linked to a tutor.', 400);
  }
  const row = await partnersRepository.insertPartner(input, staffUser.id);
  return toPartner(row);
}

export async function updatePartner(id: string, input: UpdatePartnerInput): Promise<Partner> {
  await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  const changes: Database['public']['Tables']['partners']['Update'] = {};
  if (input.fullName !== undefined) changes.full_name = input.fullName;
  if (input.email !== undefined) changes.email = input.email;
  if (input.phone !== undefined) changes.phone = input.phone;
  if (input.companyName !== undefined) changes.company_name = input.companyName;
  if (input.commissionRate !== undefined) changes.commission_rate = input.commissionRate;
  if (input.payoutMethod !== undefined) changes.payout_method = input.payoutMethod;
  if (input.payoutDetails !== undefined) changes.payout_details = input.payoutDetails;
  const row = await partnersRepository.updatePartnerFields(id, changes);
  return toPartner(row);
}

export async function suspendPartner(id: string): Promise<Partner> {
  await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  const row = await partnersRepository.updatePartnerFields(id, { status: 'suspended' });
  return toPartner(row);
}

export async function reactivatePartner(id: string): Promise<Partner> {
  await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  const row = await partnersRepository.updatePartnerFields(id, { status: 'active' });
  return toPartner(row);
}

export async function approvePartnerApplication(id: string): Promise<Partner> {
  const staffUser = await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  const existing = await partnersRepository.selectPartnerById(id);
  if (!existing) throw new AppError('NOT_FOUND', 'Partner application not found.', 404);
  if (existing.status !== 'pending') {
    throw new AppError('CONFLICT', 'This application has already been reviewed.', 409);
  }
  const row = await partnersRepository.approvePartner(id, staffUser.id);
  // Seed the portal PIN from the last 4 digits of phone, same pattern as
  // every other external-party portal (tutors, corporate, participants).
  // Never seeded for tutor-category partners — they use their existing
  // tutor_auth instead.
  if (row.category !== 'tutor') {
    const initialPin = lastFourDigits(row.phone);
    if (initialPin) {
      await partnersRepository.insertPartnerAuthIfMissing(row.id, hashPin(initialPin));
    }
  }
  return toPartner(row);
}

export async function rejectPartnerApplication(id: string): Promise<Partner> {
  const staffUser = await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  const existing = await partnersRepository.selectPartnerById(id);
  if (!existing) throw new AppError('NOT_FOUND', 'Partner application not found.', 404);
  if (existing.status !== 'pending') {
    throw new AppError('CONFLICT', 'This application has already been reviewed.', 409);
  }
  const row = await partnersRepository.rejectPartner(id, staffUser.id);
  return toPartner(row);
}

// --- Codes ---

export async function createCode(input: CreateCodeInput): Promise<Code> {
  const staffUser = await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  try {
    const row = await partnersRepository.insertCode(input, staffUser.id);
    return toCode(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('DUPLICATE_CODE', 'That code is already in use.', 409);
    }
    throw err;
  }
}

export async function deactivateCode(id: string): Promise<void> {
  await usersService.requireRole([...STAFF_MANAGE_ROLES]);
  await partnersRepository.deactivateCode(id);
}

export async function listCodes(filters?: { partnerId?: string }): Promise<Code[]> {
  await usersService.requireRole([...STAFF_MANAGE_ROLES, ...STAFF_FINANCE_ROLES]);
  const rows = await partnersRepository.selectCodes(filters);
  return rows.map(toCode);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

// --- Code validation + redemption ---

export async function previewCode(codeStr: string, batchId: string): Promise<CodePreview> {
  const code = await partnersRepository.selectCodeByCodeSystem(codeStr);
  if (!code || !code.is_active) {
    return { valid: false, discountType: null, discountValue: null, partnerId: null, reason: 'This code is not valid.' };
  }
  if (code.expires_at && new Date(code.expires_at) < new Date()) {
    return { valid: false, discountType: null, discountValue: null, partnerId: null, reason: 'This code has expired.' };
  }
  if (code.max_uses !== null && code.uses_count >= code.max_uses) {
    return { valid: false, discountType: null, discountValue: null, partnerId: null, reason: 'This code has reached its usage limit.' };
  }
  if (code.applies_to_course_id) {
    const batch = await coursesService.getBatchByIdSystem(batchId);
    if (!batch || batch.courseId !== code.applies_to_course_id) {
      return { valid: false, discountType: null, discountValue: null, partnerId: null, reason: 'This code does not apply to this course.' };
    }
  }
  return {
    valid: true,
    discountType: code.discount_type as CodePreview['discountType'],
    discountValue: code.discount_value !== null ? Number(code.discount_value) : null,
    partnerId: code.partner_id,
  };
}

// Called only by modules/registrations, after the registration+payment rows
// already exist. Records the redemption (with fraud flags) but creates NO
// commission row yet — "Tracked" is this row existing with no commission,
// per the doc's pipeline. The existing-lead check must run in
// modules/registrations (before its own lead-dedup logic erases the
// signal) — this function just stores whatever it's told.
export async function redeemCodeSystem(input: {
  code: string;
  registrationId: string;
  participantId: string;
  participantEmail: string;
  participantPhone: string;
  attributionMethod: 'code' | 'link';
  existingLeadAtRedemption: boolean;
  discountAmountApplied: number;
}): Promise<void> {
  const code = await partnersRepository.selectCodeByCodeSystem(input.code);
  if (!code) return;

  if (code.one_per_participant) {
    const priorCount = await partnersRepository.countRedemptionsForCodeAndParticipantSystem(
      code.id,
      input.participantId,
    );
    if (priorCount > 0) return;
  }

  let selfReferral = false;
  if (code.partner_id) {
    const partner = await partnersRepository.selectPartnerByIdSystem(code.partner_id);
    if (
      partner &&
      ((partner.email && partner.email === input.participantEmail) ||
        partner.phone === input.participantPhone)
    ) {
      selfReferral = true;
    }
  }

  await partnersRepository.insertCodeRedemptionSystem({
    code_id: code.id,
    registration_id: input.registrationId,
    participant_id: input.participantId,
    discount_amount_applied: input.discountAmountApplied,
    attribution_method: input.attributionMethod,
    existing_lead_at_redemption: input.existingLeadAtRedemption,
    self_referral_at_redemption: selfReferral,
  });
  await partnersRepository.incrementCodeUsesSystem(code.id, code.uses_count + 1);
}

export async function recordLinkClickSystem(codeStr: string): Promise<void> {
  const code = await partnersRepository.selectCodeByCodeSystem(codeStr);
  if (!code) return;
  await partnersRepository.insertLinkClickSystem(code.id);
}

// Called from modules/payments' runPaidTransitionSideEffects, once a
// registration's payment actually clears — "Pending" starts here, using the
// amount ACTUALLY paid (doc SS2: "calculated on the amount actually
// collected... not the advertised course fee").
export async function accrueCommissionOnPaymentSystem(
  registrationId: string,
  amountPaid: number,
): Promise<void> {
  const redemption = await partnersRepository.selectRedemptionByRegistrationSystem(registrationId);
  if (!redemption) return;
  if (redemption.existing_lead_at_redemption || redemption.self_referral_at_redemption) return;

  const code = await partnersRepository.selectCodeByIdSystem(redemption.code_id);
  if (!code?.partner_id) return;
  const partner = await partnersRepository.selectPartnerByIdSystem(code.partner_id);
  if (!partner || partner.status !== 'active') return;

  const existingCommission = await partnersRepository.selectCommissionByRegistrationSystem(registrationId);
  if (existingCommission) return; // already accrued (e.g. a second payment top-up)

  const commissionAmount = await computeCommissionAmount(partner, amountPaid);
  if (commissionAmount === null || commissionAmount <= 0) return;

  const batchStartDate = await partnersRepository.selectBatchStartDateForRegistrationSystem(
    registrationId,
  );

  const holdUntil = new Date();
  holdUntil.setDate(holdUntil.getDate() + COMMISSION_HOLD_DAYS);
  const batchStart = batchStartDate ? new Date(batchStartDate) : holdUntil;
  const qualifiesAt = holdUntil > batchStart ? holdUntil : batchStart;

  await partnersRepository.insertCommissionSystem({
    partner_id: partner.id,
    registration_id: registrationId,
    code_redemption_id: redemption.id,
    commission_amount: commissionAmount,
    qualifies_at: qualifiesAt.toISOString().slice(0, 10),
  });
}

// Bundled into the existing 07:00 cron — pending -> approved once
// qualifies_at has passed.
export async function runCommissionQualificationDispatch(
  now = new Date(),
): Promise<{ approved: number }> {
  const todayIso = now.toISOString().slice(0, 10);
  const due = await partnersRepository.selectPendingCommissionsDueSystem(todayIso);
  for (const commission of due) {
    await partnersRepository.updateCommissionStatusSystem(commission.id, {
      status: 'approved',
      approved_at: now.toISOString(),
    });
  }
  return { approved: due.length };
}

// --- Staff commissions & payouts ---

export async function listCommissions(filters?: {
  status?: string;
  partnerId?: string;
}): Promise<PartnerCommissionView[]> {
  await usersService.requireRole([...STAFF_FINANCE_ROLES]);
  const rows = await partnersRepository.selectCommissions(filters);
  const partnerIds = [...new Set(rows.map((r) => r.partner_id))];
  const partners = await Promise.all(partnerIds.map((id) => partnersRepository.selectPartnerById(id)));
  const partnerById = new Map(partners.filter((p): p is PartnerRow => p !== null).map((p) => [p.id, p]));
  const context = await partnersRepository.selectCommissionContextSystem(rows.map((r) => r.registration_id));
  return rows.map((row) => {
    const partner = partnerById.get(row.partner_id);
    const info = context.get(row.registration_id);
    return {
      ...toCommission(row),
      partnerName: partner?.full_name ?? '',
      partnerCategory: (partner?.category as PartnerCategory) ?? 'ambassador',
      participantName: info?.participantName ?? '',
      courseName: info?.courseName ?? '',
      cohortLabel: info?.cohortLabel ?? '',
    };
  });
}

export async function markCommissionsPayable(commissionIds: string[]): Promise<void> {
  const staffUser = await usersService.requireRole([...STAFF_FINANCE_ROLES]);
  for (const id of commissionIds) {
    const commission = await partnersRepository.selectCommissionById(id);
    if (!commission) continue;
    if (commission.status !== 'approved') {
      throw new AppError('CONFLICT', 'Only approved commissions can be marked payable.', 409);
    }
    await partnersRepository.updateCommissionStatus(id, {
      status: 'payable',
      marked_payable_at: new Date().toISOString(),
      marked_payable_by: staffUser.id,
    });
  }
}

export async function recordPayout(input: RecordPayoutInput): Promise<PartnerPayout> {
  await usersService.requireRole([...STAFF_FINANCE_ROLES]);
  let total = 0;
  const commissions: CommissionRow[] = [];
  for (const id of input.commissionIds) {
    const commission = await partnersRepository.selectCommissionById(id);
    if (!commission) throw new AppError('NOT_FOUND', 'Commission not found.', 404);
    if (commission.partner_id !== input.partnerId) {
      throw new AppError('VALIDATION_ERROR', 'All commissions in a payout must belong to the same partner.', 400);
    }
    if (commission.status !== 'payable') {
      throw new AppError('CONFLICT', 'Only commissions marked payable can be paid out.', 409);
    }
    total += Number(commission.commission_amount);
    commissions.push(commission);
  }

  const payoutRow = await partnersRepository.insertPayout({
    partner_id: input.partnerId,
    total_amount: round2(total),
    method: input.method,
    reference: input.reference ?? null,
  });

  for (const commission of commissions) {
    await partnersRepository.updateCommissionStatus(commission.id, {
      status: 'paid',
      payout_id: payoutRow.id,
      paid_at: new Date().toISOString(),
    });
  }

  return toPayout(payoutRow);
}

// --- Partner portal auth (non-tutor categories only) — mirrors
// modules/corporate/service.ts's loginToCompanyPortal/
// requireCompanyPortalSession/changeCompanyPin/logoutOfCompanyPortal
// exactly, scoped to partner_id and keyed by phone instead of email. ---

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export async function loginToPartnerPortal(
  input: PartnerPortalLoginInput,
): Promise<PartnerPortalLoginResult> {
  const partner = await partnersRepository.selectPartnerByPhoneSystem(input.phone.trim());
  // Tutor Partners use their existing tutor login; a self-served student
  // ambassador (participant_id set) uses their existing student portal
  // login — neither ever gets a partner_auth row.
  if (!partner || partner.category === 'tutor' || partner.participant_id !== null) {
    return { status: 'invalid' };
  }

  let auth = await partnersRepository.selectPartnerAuth(partner.id);
  if (!auth) {
    const initialPin = lastFourDigits(partner.phone);
    if (initialPin) {
      await partnersRepository.insertPartnerAuthIfMissing(partner.id, hashPin(initialPin));
      auth = await partnersRepository.selectPartnerAuth(partner.id);
    }
  }
  if (!auth) return { status: 'invalid' };

  if (auth.locked_until && new Date(auth.locked_until) > new Date()) {
    return { status: 'locked' };
  }

  if (!verifyPin(input.pin, auth.pin_hash)) {
    const nextFailedAttempts = auth.failed_attempts + 1;
    if (nextFailedAttempts >= LOCKOUT_THRESHOLD) {
      await partnersRepository.recordFailedPartnerLogin(partner.id, {
        failed_attempts: 0,
        locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString(),
      });
      return { status: 'locked' };
    }
    await partnersRepository.recordFailedPartnerLogin(partner.id, {
      failed_attempts: nextFailedAttempts,
      locked_until: null,
    });
    return { status: 'invalid' };
  }

  await partnersRepository.recordSuccessfulPartnerLogin(partner.id);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const session = await partnersRepository.insertPartnerSession(partner.id, expiresAt);
  return { status: 'ok', sessionId: session.id, expiresAt, mustChangePin: auth.must_change_pin };
}

export async function requirePartnerPortalSession(
  sessionId: string | undefined,
): Promise<{ partnerId: string }> {
  if (!sessionId) {
    throw new AppError('UNAUTHENTICATED', 'You must be signed in.', 401);
  }
  const session = await partnersRepository.selectPartnerSession(sessionId);
  if (!session || session.revoked_at !== null || new Date(session.expires_at) <= new Date()) {
    throw new AppError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 401);
  }
  return { partnerId: session.partner_id };
}

export async function changePartnerPin(
  sessionId: string | undefined,
  input: PartnerPortalChangePinInput,
): Promise<void> {
  const { partnerId } = await requirePartnerPortalSession(sessionId);
  const auth = await partnersRepository.selectPartnerAuth(partnerId);
  if (!auth || !verifyPin(input.currentPin, auth.pin_hash)) {
    throw new AppError('INVALID_PIN', 'Your current PIN is incorrect.', 400);
  }
  await partnersRepository.updatePartnerPin(partnerId, hashPin(input.newPin));
}

export async function logoutOfPartnerPortal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await partnersRepository.revokePartnerSession(sessionId);
}

async function summarizeCommissions(partnerId: string): Promise<{
  totals: Record<CommissionStatus, number>;
  payouts: PartnerPayout[];
  payableIds: string[];
}> {
  const commissionRows = await partnersRepository.selectCommissions({ partnerId });
  const totals: Record<CommissionStatus, number> = {
    pending: 0,
    approved: 0,
    payable: 0,
    paid: 0,
    clawed_back: 0,
    redeemed: 0,
  };
  const payableIds: string[] = [];
  for (const row of commissionRows) {
    const status = row.status as CommissionStatus;
    totals[status] = round2(totals[status] + Number(row.commission_amount));
    if (status === 'payable') payableIds.push(row.id);
  }
  const payoutRows = await partnersRepository.selectPayoutsForPartnerSystem(partnerId);
  return { totals, payouts: payoutRows.map(toPayout), payableIds };
}

export async function getPartnerPortalDashboard(
  sessionId: string | undefined,
): Promise<PartnerPortalDashboard> {
  const { partnerId } = await requirePartnerPortalSession(sessionId);
  const partner = await partnersRepository.selectPartnerByIdSystem(partnerId);
  if (!partner) throw new AppError('NOT_FOUND', 'Partner not found.', 404);
  const auth = await partnersRepository.selectPartnerAuth(partnerId);

  const codeRows = await partnersRepository.selectCodesForPartnerSystem(partnerId);
  const codeIds = codeRows.map((c) => c.id);
  const clickCounts = await partnersRepository.countClicksForCodesSystem(codeIds);
  const redemptionRows = await partnersRepository.selectRedemptionsForCodesSystem(codeIds);
  const redemptionCounts = new Map<string, number>();
  for (const row of redemptionRows) {
    redemptionCounts.set(row.code_id, (redemptionCounts.get(row.code_id) ?? 0) + 1);
  }

  const { totals, payouts, payableIds } = await summarizeCommissions(partnerId);

  return {
    fullName: partner.full_name,
    category: partner.category as PartnerCategory,
    phone: partner.phone,
    mustChangePin: auth?.must_change_pin ?? true,
    codes: codeRows.map(toCode),
    clickCounts: Object.fromEntries(clickCounts),
    redemptionCounts: Object.fromEntries(redemptionCounts),
    commissionTotals: totals,
    recentPayouts: payouts.slice(0, 12),
    payableCommissionIds: payableIds,
  };
}

// --- Tutor-portal integration (permitted cross-module call from
// modules/tutors' dashboard assembly, same posture as every other module
// modules/tutors already reaches into) ---

export async function getReferralSummaryForTutor(tutorId: string): Promise<PartnerReferralSummary | null> {
  const partner = await partnersRepository.selectPartnerByTutorIdSystem(tutorId);
  if (!partner || partner.status !== 'active') return null;
  const codeRows = await partnersRepository.selectCodesForPartnerSystem(partner.id);
  const { totals, payouts, payableIds } = await summarizeCommissions(partner.id);
  return {
    codes: codeRows.map(toCode),
    commissionTotals: totals,
    recentPayouts: payouts.slice(0, 12),
    payableCommissionIds: payableIds,
  };
}

export async function getPartnerForTutorSystem(tutorId: string): Promise<Partner | null> {
  const row = await partnersRepository.selectPartnerByTutorIdSystem(tutorId);
  return row ? toPartner(row) : null;
}

// Every tutor automatically gets affiliate capability through their
// existing tutor account (the doc's own stated intent) — auto-provisions a
// partner record + one referral code the first time it's needed, instead
// of requiring a staff member to manually link one first. Idempotent.
export async function ensurePartnerForTutorSystem(
  tutorId: string,
  fullName: string,
  phone: string,
  email: string | null,
): Promise<Partner> {
  const existing = await partnersRepository.selectPartnerByTutorIdSystem(tutorId);
  if (existing) return toPartner(existing);
  const row = await partnersRepository.insertTutorPartnerSystem({ tutorId, fullName, phone, email });
  await generateUniqueCodeForPartnerSystem(row.id, fullName);
  return toPartner(row);
}

// --- Participant-portal integration (existing students self-serving as
// Ambassadors, 2026-08-02) — same posture as the tutor integration above:
// permitted cross-module call from modules/portal, no separate login. ---

export async function getReferralSummaryForParticipant(
  participantId: string,
): Promise<PartnerReferralSummary | null> {
  const partner = await partnersRepository.selectPartnerByParticipantIdSystem(participantId);
  if (!partner || partner.status !== 'active') return null;
  const codeRows = await partnersRepository.selectCodesForPartnerSystem(partner.id);
  const { totals, payouts, payableIds } = await summarizeCommissions(partner.id);
  return {
    codes: codeRows.map(toCode),
    commissionTotals: totals,
    recentPayouts: payouts.slice(0, 12),
    payableCommissionIds: payableIds,
  };
}

// Self-serve "Refer & Earn" — an existing student becomes an Ambassador
// partner immediately, no staff review (founder-approved 2026-08-02,
// distinct from the public application form's manual-approval path).
// Idempotent — a student who's already a partner just gets their existing
// record back.
export async function ensurePartnerForParticipantSystem(
  participantId: string,
  fullName: string,
  phone: string,
  email: string | null,
): Promise<Partner> {
  const existing = await partnersRepository.selectPartnerByParticipantIdSystem(participantId);
  if (existing) return toPartner(existing);
  const row = await partnersRepository.insertAmbassadorPartnerForParticipantSystem({
    participantId,
    fullName,
    phone,
    email,
  });
  await generateUniqueCodeForPartnerSystem(row.id, fullName);
  return toPartner(row);
}

export async function getPartnerForParticipantSystem(participantId: string): Promise<Partner | null> {
  const row = await partnersRepository.selectPartnerByParticipantIdSystem(participantId);
  return row ? toPartner(row) : null;
}

// Human-readable auto-generated code (e.g. "KWAME482") — retries on a
// collision since uniqueness is only enforced at the DB level.
function slugifyNameForCode(fullName: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] ?? 'PARTNER';
  const cleaned = firstName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 8) : 'PARTNER';
}

async function generateUniqueCodeForPartnerSystem(partnerId: string, fullName: string): Promise<void> {
  const base = slugifyNameForCode(fullName);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = Math.floor(100 + Math.random() * 900);
    try {
      await partnersRepository.insertCodeSystem({ code: `${base}${suffix}`, partner_id: partnerId });
      return;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // collision — loop and try another suffix
    }
  }
  throw new AppError('INTERNAL_ERROR', 'Could not generate a unique referral code. Please try again.', 500);
}

// --- Commission credit redemption (founder-approved 2026-08-02) — a
// partner spends their own 'payable' commission balance to reduce a course
// fee (their own, or a referred student's) instead of a cash payout.
// modules/payments/service.ts owns the actual fee mutation (that's its
// job); these two functions are the partners-side validation and
// bookkeeping it calls into, mirroring the existing accrual/payout split. ---

export async function validateAndTotalRedeemableCommissionsSystem(
  partnerId: string,
  commissionIds: string[],
): Promise<number> {
  let total = 0;
  for (const id of commissionIds) {
    const commission = await partnersRepository.selectCommissionByIdSystem(id);
    if (!commission) throw new AppError('NOT_FOUND', 'Commission not found.', 404);
    if (commission.partner_id !== partnerId) {
      throw new AppError('FORBIDDEN', 'That commission does not belong to you.', 403);
    }
    if (commission.status !== 'payable') {
      throw new AppError('CONFLICT', 'Only payable commissions can be redeemed as course credit.', 409);
    }
    total += Number(commission.commission_amount);
  }
  if (total <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Select at least one payable commission to redeem.', 400);
  }
  return round2(total);
}

export async function markCommissionsRedeemedSystem(
  commissionIds: string[],
  registrationId: string,
): Promise<void> {
  for (const id of commissionIds) {
    await partnersRepository.updateCommissionStatusSystem(id, {
      status: 'redeemed',
      redeemed_against_registration_id: registrationId,
      paid_at: new Date().toISOString(),
    });
  }
}

// --- QR code (same QRCode.toDataURL pattern as lib/certificates/pdf.ts) ---

// batchId (2026-08-02 follow-up) — optional, makes the link/QR land the
// visitor on /register with that course already selected (RegistrationForm
// already reads ?batchId= on mount). Never persisted; a pure URL hint.
export function buildReferralUrl(code: string, batchId?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';
  const url = new URL(`/r/${encodeURIComponent(code)}`, base);
  if (batchId) url.searchParams.set('batchId', batchId);
  return url.toString();
}

export async function generateReferralQrDataUrl(code: string, batchId?: string): Promise<string> {
  return QRCode.toDataURL(buildReferralUrl(code, batchId), {
    margin: 0,
    width: 220,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  });
}
