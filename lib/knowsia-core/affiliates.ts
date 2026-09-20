// Knowsia Core Affiliates — the attribution half, from this app (Doc 22 §7
// Phase 4, Release 4, 2026-09-19; Doc 24 §4).
//
// A referral is ONE record across both products: this app's partners, their
// codes, the clicks on their links and the code redemptions are mirrored to
// Core, so a partner who sends someone to Knowsia Study is credited the
// same way as one who sends them to a cohort. This app keeps its own rows
// and screens, and its commission accrual keeps running from its own
// `code_redemptions` until Phase 6 pays from Core's record. Best effort in
// every direction — Core being down never costs an application, a code, a
// click or a registration.
import { captureToSentry } from '@/lib/errors';
import type { Code, Partner } from '@/modules/partners/types';

export function isCoreAffiliatesConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

export interface CorePartnerRecord {
  id: string;
  product: string;
  display_name: string;
  status: string;
  external_ref: string | null;
  created: boolean;
}

export interface CoreReferralCodeRecord {
  id: string;
  partner_id: string;
  code: string;
  coupon_id: string | null;
  is_active: boolean;
  created: boolean;
}

export interface CoreAttributionRecord {
  attributed: boolean;
  created: boolean;
  id: string | null;
  status?: string;
  flags?: Record<string, boolean>;
}

/** Core's categories are this app's plus `strategic`; this app's map onto them one to one. */
export function corePartnerBody(partner: Pick<Partner, 'id' | 'category' | 'fullName' | 'email' | 'phone' | 'companyName' | 'status'>) {
  return {
    product: 'registration',
    external_ref: partner.id,
    display_name: partner.category === 'institutional' && partner.companyName ? partner.companyName : partner.fullName,
    category: partner.category,
    email: partner.email ?? null,
    phone: partner.phone,
    status: partner.status,
    notes: partner.category === 'institutional' && partner.companyName ? `Contact: ${partner.fullName}` : null,
  };
}

export async function forwardPartnerToCore(partner: Parameters<typeof corePartnerBody>[0]): Promise<CorePartnerRecord | null> {
  if (!isCoreAffiliatesConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/affiliates/partners`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(corePartnerBody(partner)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core affiliates partners answered ${response.status}`);
    return (await response.json()) as CorePartnerRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-affiliates:partner', partnerId: partner.id });
    return null;
  }
}

export async function forwardPartnerStatusToCore(partnerId: string, status: Partner['status'], reason: string | null = null): Promise<boolean> {
  if (!isCoreAffiliatesConfigured()) return false;
  try {
    const response = await fetch(`${base()}/api/v1/service/affiliates/partners/${encodeURIComponent(partnerId)}/status`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ product: 'registration', status, reason }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return false; // Core never saw the partner; the sync script will
    if (!response.ok) throw new Error(`core affiliates partner status answered ${response.status}`);
    return true;
  } catch (err) {
    captureToSentry(err, { job: 'core-affiliates:partner-status', partnerId });
    return false;
  }
}

/**
 * A code is one partner's, unique across products. A code that discounts
 * names the Release 1 coupon `upsertCodeDiscountToCore` wrote for it
 * (`external_ref = code:<id>`); a code with no discount is attribution only.
 */
export async function forwardReferralCodeToCore(code: Pick<Code, 'id' | 'code' | 'partnerId' | 'discountType' | 'discountValue' | 'maxUses' | 'expiresAt' | 'isActive'>): Promise<CoreReferralCodeRecord | null> {
  if (!isCoreAffiliatesConfigured() || !code.partnerId) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/affiliates/codes`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        partner_external_ref: code.partnerId,
        code: code.code,
        coupon_external_ref: code.discountType && code.discountValue ? `code:${code.id}` : null,
        product_scope: ['*'],
        is_active: code.isActive,
        expires_at: code.expiresAt,
        max_uses: code.maxUses,
        external_ref: code.id,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return null; // the partner is not in Core yet; the sync script will
    if (!response.ok) throw new Error(`core affiliates codes answered ${response.status}`);
    return (await response.json()) as CoreReferralCodeRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-affiliates:code', codeId: code.id });
    return null;
  }
}

export async function forwardReferralClickToCore(code: string, landing: string | null = null, referrer: string | null = null): Promise<boolean> {
  if (!isCoreAffiliatesConfigured()) return false;
  try {
    const response = await fetch(`${base()}/api/v1/service/affiliates/clicks`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ product: 'registration', code, landing, referrer }),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch (err) {
    captureToSentry(err, { job: 'core-affiliates:click' });
    return false;
  }
}

/**
 * The redemption `redeemCodeSystem` just recorded, with the flags it computed
 * — Core keeps ONE attribution per participant on this product and answers
 * `created: false` for a repeat. Attribution only; the discount, where one
 * applied, went through the catalogue door separately.
 */
export async function forwardAttributionToCore(input: {
  redemptionId: string;
  code: string;
  participantId: string;
  participantEmail: string;
  participantPhone: string | null;
  method: 'code' | 'link';
  existingLead: boolean;
  selfReferral: boolean;
  attributedAt?: string | null;
}): Promise<CoreAttributionRecord | null> {
  if (!isCoreAffiliatesConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/affiliates/attributions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        code: input.code,
        subject_type: 'participant',
        subject_id: input.participantId,
        subject_email: input.participantEmail,
        subject_phone: input.participantPhone,
        method: input.method,
        existing_lead: input.existingLead,
        self_referral: input.selfReferral,
        external_ref: input.redemptionId,
        attributed_at: input.attributedAt ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core affiliates attributions answered ${response.status}`);
    return (await response.json()) as CoreAttributionRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-affiliates:attribution', redemptionId: input.redemptionId });
    return null;
  }
}
