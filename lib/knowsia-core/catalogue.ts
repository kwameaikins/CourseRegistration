// Knowsia Core Catalogue & pricing, from this app (Doc 22 §7 Phase 4,
// 2026-09-19; Doc 24).
//
// Every sellable thing has ONE SKU in Core: a batch is a `cohort_seat` SKU
// (its early-bird price a rule until the cutoff), a coupon is a Core coupon,
// a discounting partner code is a Core coupon too, and every redemption is
// forwarded so Core's ledger knows what discount was given on what.
//
// THIS APP'S PRICE STAYS AUTHORITATIVE UNTIL PHASE 5. `course_fee` on the
// batch still decides what a student pays; Core is told, and — with
// CORE_QUOTE_SHADOW=1 — asked what IT would charge, and any disagreement is
// reported to Sentry so the two can be reconciled before checkout moves.
// Best effort in every direction: Core being down never costs a batch, a
// coupon, a registration or a payment.
import { captureToSentry } from '@/lib/errors';

export function isCoreCatalogueConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

/** `cohort.<course code>.<cohort label>` — lower-case, dotted, the way Core spells a code. */
export function batchSkuCode(courseCode: string, cohortLabel: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  return `cohort.${slug(courseCode)}.${slug(cohortLabel) || 'cohort'}`;
}

/** Course-scoped coupons and codes apply to every cohort of the course through this prefix. */
export function courseCodePrefix(courseCode: string): string {
  return `${batchSkuCode(courseCode, 'x').replace(/\.x$/, '')}.`;
}

const toMinor = (ghs: number): number => Math.round(ghs * 100);

export interface BatchForCore {
  id: string;
  cohortLabel: string;
  courseFee: number;
  isFree: boolean;
  discountCutoffDate: string | null;
  discountedFee: number | null;
  startDate: string;
  endDate: string;
  isUnlisted: boolean;
  isActive?: boolean;
}

export interface CoreSkuRecord {
  id: string;
  product: string;
  kind: string;
  code: string;
  price_minor: number;
  created: boolean;
}

export async function upsertBatchSkuToCore(
  batch: BatchForCore,
  course: { courseCode: string; courseName: string },
): Promise<CoreSkuRecord | null> {
  if (!isCoreCatalogueConfigured()) return null;
  const rules: Array<Record<string, unknown>> = [];
  if (!batch.isFree && batch.discountCutoffDate && batch.discountedFee !== null) {
    rules.push({
      kind: 'early_bird',
      unit_price_minor: toMinor(batch.discountedFee),
      min_qty: 1,
      // The cutoff is inclusive of that day (effectiveCourseFee compares dates).
      ends_at: `${batch.discountCutoffDate}T23:59:59Z`,
      external_ref: `${batch.id}:early_bird`,
    });
  }
  try {
    const response = await fetch(`${base()}/api/v1/service/catalogue/skus`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        kind: 'cohort_seat',
        code: batchSkuCode(course.courseCode, batch.cohortLabel),
        name: `${course.courseName} — ${batch.cohortLabel}`,
        price_minor: batch.isFree ? 0 : toMinor(batch.courseFee),
        currency: 'GHS',
        pricing: { unit: 'seat', start_date: batch.startDate, end_date: batch.endDate, unlisted: batch.isUnlisted },
        external_ref: batch.id,
        tax_treatment: 'none',
        valid_to: `${batch.endDate}T23:59:59Z`,
        active: batch.isActive ?? true,
        rules,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core catalogue skus answered ${response.status}`);
    return (await response.json()) as CoreSkuRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-catalogue:batch-sku', batchId: batch.id });
    return null;
  }
}

export interface CoreCouponRecord {
  id: string;
  code: string;
  created: boolean;
}

interface CouponLike {
  id: string;
  code: string;
  description?: string | null;
  discountType: 'percentage' | 'fixed_amount' | null;
  discountValue: number | null;
  appliesToCourseId?: string | null;
  maxUses: number | null;
  onePerParticipant: boolean;
  startsAt?: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

async function upsertCoupon(
  coupon: CouponLike,
  opts: { externalRef: string; name: string | null; courseCode: string | null; job: string },
): Promise<CoreCouponRecord | null> {
  if (!isCoreCatalogueConfigured()) return null;
  if (!coupon.discountType || coupon.discountValue === null || coupon.discountValue <= 0) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/catalogue/coupons`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        code: coupon.code,
        name: opts.name,
        discount_type: coupon.discountType,
        discount_value: coupon.discountValue,
        product_scope: ['registration'],
        applies_to: opts.courseCode ? { code_prefixes: [courseCodePrefix(opts.courseCode)] } : {},
        max_uses: coupon.maxUses,
        one_per_subject: coupon.onePerParticipant,
        starts_at: coupon.startsAt ?? null,
        expires_at: coupon.expiresAt,
        is_active: coupon.isActive,
        external_ref: opts.externalRef,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core catalogue coupons answered ${response.status}`);
    return (await response.json()) as CoreCouponRecord;
  } catch (err) {
    captureToSentry(err, { job: opts.job, externalRef: opts.externalRef });
    return null;
  }
}

/** A standalone coupon (modules/coupons). `courseCode` when it is course-scoped. */
export function upsertCouponToCore(coupon: CouponLike, courseCode: string | null): Promise<CoreCouponRecord | null> {
  return upsertCoupon(coupon, { externalRef: `coupon:${coupon.id}`, name: coupon.description ?? null, courseCode, job: 'core-catalogue:coupon' });
}

/** A partner code that carries a discount (modules/partners). A code with no discount is attribution only — Release 4's. */
export function upsertCodeDiscountToCore(code: CouponLike, courseCode: string | null): Promise<CoreCouponRecord | null> {
  return upsertCoupon(code, { externalRef: `code:${code.id}`, name: 'Partner code', courseCode, job: 'core-catalogue:code' });
}

/** A redemption that changed the price. Idempotent in Core on (coupon, reference). */
export async function forwardCouponRedemptionToCore(input: {
  code: string;
  participantId: string;
  registrationId: string;
  discountGhs: number;
  stage?: 'registration' | 'checkout' | 'staff';
  appliedByStaffId?: string | null;
  externalRef?: string | null;
}): Promise<boolean> {
  if (!isCoreCatalogueConfigured()) return false;
  try {
    const response = await fetch(`${base()}/api/v1/service/catalogue/coupons/redemptions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        code: input.code,
        product: 'registration',
        subject_type: 'participant',
        subject_id: input.participantId,
        reference: input.registrationId,
        discount_minor: toMinor(input.discountGhs),
        stage: input.stage ?? 'registration',
        applied_by: input.appliedByStaffId ?? null,
        external_ref: input.externalRef ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 404: Core has no such coupon yet (created before the sync ran) — the
    // sync script backfills it; nothing to do here.
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`core catalogue redemptions answered ${response.status}`);
    return true;
  } catch (err) {
    captureToSentry(err, { job: 'core-catalogue:redemption', registrationId: input.registrationId });
    return false;
  }
}

export interface CoreQuote {
  total_minor: number;
  subtotal_minor: number;
  price_source: string;
  coupon: { code: string; outcome: string; won: boolean; discount_minor: number } | null;
}

/**
 * Ask Core what it would charge and compare with what this app charged.
 * A disagreement is a Sentry event, never an error to the student — this is
 * the measurement that lets checkout move to Core in Phase 5. Runs only
 * with CORE_QUOTE_SHADOW=1.
 */
export async function shadowQuote(input: {
  courseCode: string;
  cohortLabel: string;
  couponCode?: string | null;
  participantId?: string | null;
  chargedGhs: number;
  registrationId: string;
}): Promise<CoreQuote | null> {
  if (process.env.CORE_QUOTE_SHADOW !== '1' || !isCoreCatalogueConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/catalogue/quote`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        sku_code: batchSkuCode(input.courseCode, input.cohortLabel),
        qty: 1,
        coupon_code: input.couponCode ?? null,
        subject_type: input.participantId ? 'participant' : null,
        subject_id: input.participantId ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core catalogue quote answered ${response.status}`);
    const quote = (await response.json()) as CoreQuote;
    if (quote.total_minor !== toMinor(input.chargedGhs)) {
      captureToSentry(new Error('[core-quote-disagreement]'), {
        job: 'core-catalogue:shadow-quote',
        registrationId: input.registrationId,
        chargedMinor: String(toMinor(input.chargedGhs)),
        coreMinor: String(quote.total_minor),
        priceSource: quote.price_source,
      });
    }
    return quote;
  } catch (err) {
    captureToSentry(err, { job: 'core-catalogue:shadow-quote', registrationId: input.registrationId });
    return null;
  }
}
