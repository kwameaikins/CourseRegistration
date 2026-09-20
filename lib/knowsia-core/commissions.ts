// Knowsia Core Affiliates — the money half, from this app (Doc 22 §7 Phase 6;
// Doc 25 §2, 2026-09-20).
//
// A commission is derived from Core's money ledger by the consumer that
// converts the referral — this app no longer computes one. Its dashboards
// (the partner portal, the tutor's and the student's referral panels) and
// its staff console READ Core; marking payable, recording a payout by hand
// and redeeming a commission as course credit go through Core's doors. This
// app's `partner_commissions` / `partner_payouts` stay readable for 30 days
// as history (carried over by scripts/sync-commissions-to-core.mjs) and are
// dropped in Phase 7. Best effort on reads — Core down shows an empty
// ledger with a note, never a crashed portal; a write that fails raises,
// because money is involved.
import { AppError, captureToSentry } from '@/lib/errors';

export function isCoreCommissionsConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

export type CoreCommissionStatus = 'pending' | 'approved' | 'payable' | 'paid' | 'redeemed' | 'reversed' | 'void';

export interface CoreCommissionRecord {
  id: string;
  partner_id: string;
  attribution_id: string | null;
  product: string;
  payment_reference: string | null;
  base_minor: number;
  rate_bps: number | null;
  flat_minor: number | null;
  amount_minor: number;
  currency: string;
  status: CoreCommissionStatus;
  qualifies_at: string | null;
  hold_reason: string | null;
  void_reason: string | null;
  approved_at: string | null;
  payable_at: string | null;
  paid_at: string | null;
  payout_id: string | null;
  reversal_of: string | null;
  redeemed_ref: string | null;
  external_ref: string | null;
  created_at: string | null;
  partner_display_name?: string | null;
  partner_category?: string | null;
  attribution_external_ref?: string | null;
  subject_id?: string | null;
  partner_external_ref?: string | null;
}

export interface CorePayoutRecord {
  id: string;
  partner_id: string;
  total_minor: number;
  currency: string;
  method: 'transfer' | 'manual' | 'redeemed';
  reference: string | null;
  commission_ids: string[];
  status: 'pending' | 'paid' | 'failed';
  paid_at: string | null;
  created_at: string | null;
}

export interface CoreLedger {
  partner_id: string;
  totals_minor: Record<string, number>;
  payable_balance_minor: number;
  payable_ids: string[];
  min_payout_minor: number;
  can_pay_out: boolean;
  commissions: CoreCommissionRecord[];
  payouts: CorePayoutRecord[];
  statements: Array<{ id: string; period_start: string; period_end: string; closing_minor: number; earned_minor: number; paid_minor: number }>;
}

export async function readPartnerLedger(partnerId: string): Promise<CoreLedger | null> {
  if (!isCoreCommissionsConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/affiliates/partners/${encodeURIComponent(partnerId)}/ledger?product=registration`, {
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`core affiliates ledger answered ${response.status}`);
    return (await response.json()) as CoreLedger;
  } catch (err) {
    captureToSentry(err, { job: 'core-commissions:ledger', partnerId });
    return null;
  }
}

export async function listCoreCommissions(filters: { status?: string; partnerId?: string } = {}): Promise<CoreCommissionRecord[] | null> {
  if (!isCoreCommissionsConfigured()) return null;
  try {
    const params = new URLSearchParams({ product: 'registration', status: filters.status ?? 'all' });
    if (filters.partnerId) params.set('partner_external_ref', filters.partnerId);
    const response = await fetch(`${base()}/api/v1/service/affiliates/commissions?${params.toString()}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`core affiliates commissions answered ${response.status}`);
    return ((await response.json()) as { items: CoreCommissionRecord[] }).items;
  } catch (err) {
    captureToSentry(err, { job: 'core-commissions:list' });
    return null;
  }
}

async function mustPost(path: string, body: unknown, job: string): Promise<Response> {
  if (!isCoreCommissionsConfigured()) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Knowsia Core is not configured; commissions cannot be changed from here.', 503);
  }
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    captureToSentry(err, { job });
    throw new AppError('SERVICE_UNAVAILABLE', 'Knowsia Core could not be reached. Nothing was changed.', 503);
  }
  if (!response.ok) {
    const detail = await response.json().then((j: { detail?: string }) => j.detail).catch(() => null);
    const code = response.status === 409 ? 'CONFLICT' : response.status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR';
    throw new AppError(code, detail ? String(detail) : `Knowsia Core answered ${response.status}.`, response.status >= 400 && response.status < 500 ? response.status : 502);
  }
  return response;
}

export async function markPayableOnCore(commissionIds: string[], actorRef: string | null): Promise<CoreCommissionRecord[]> {
  const response = await mustPost('/api/v1/service/affiliates/commissions/payable', { product: 'registration', commission_ids: commissionIds, actor_ref: actorRef }, 'core-commissions:payable');
  return ((await response.json()) as { items: CoreCommissionRecord[] }).items;
}

export async function recordPayoutOnCore(input: { partnerId: string; commissionIds: string[] | null; reference: string | null; actorRef: string | null }): Promise<CorePayoutRecord> {
  const response = await mustPost(`/api/v1/service/affiliates/partners/${encodeURIComponent(input.partnerId)}/payouts`, {
    product: 'registration', commission_ids: input.commissionIds, method: 'manual', reference: input.reference, actor_ref: input.actorRef,
  }, 'core-commissions:payout');
  return (await response.json()) as CorePayoutRecord;
}

export async function redeemOnCore(input: { partnerId: string; commissionIds: string[]; registrationId: string }): Promise<{ total_minor: number; payout_id: string }> {
  const response = await mustPost(`/api/v1/service/affiliates/partners/${encodeURIComponent(input.partnerId)}/redeem`, {
    product: 'registration', commission_ids: input.commissionIds, reference: input.registrationId,
  }, 'core-commissions:redeem');
  return (await response.json()) as { total_minor: number; payout_id: string };
}
