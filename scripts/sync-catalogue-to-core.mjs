// One-off: mirror this app's batches, coupons and discounting partner codes
// into Knowsia Core's catalogue (Doc 22 §7 Phase 4, 2026-09-19), and the
// redemptions already recorded against them. Idempotent — Core keeps one SKU
// per (product, code), one coupon per code, one redemption per (coupon,
// reference) — so it can be re-run after any gap. Loads .env.local itself and
// prints counts only, never a key.
//   node scripts/sync-catalogue-to-core.mjs [--dry-run] [--skip-redemptions]
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* absent */ }
}
const dryRun = process.argv.includes('--dry-run');
const skipRedemptions = process.argv.includes('--skip-redemptions');
const base = (process.env.KNOWSIA_APP_API_URL ?? '').replace(/\/+$/, '');
const key = process.env.KNOWSIA_APP_SERVICE_KEY;
if (!base || !key) throw new Error('KNOWSIA_APP_API_URL and KNOWSIA_APP_SERVICE_KEY are required');

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const skuCode = (courseCode, cohortLabel) => `cohort.${slug(courseCode)}.${slug(cohortLabel) || 'cohort'}`;
const prefix = (courseCode) => `cohort.${slug(courseCode)}.`;
const minor = (ghs) => Math.round(Number(ghs) * 100);

async function core(method, path, body) {
  if (dryRun) return { ok: true, status: 0 };
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status };
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };

const courses = must(await db.from('courses').select('id, course_code, course_name'));
const byCourse = new Map(courses.map((c) => [c.id, c]));
const batches = must(await db.from('batches').select('id, course_id, cohort_label, course_fee, is_free, is_unlisted, is_active, start_date, end_date, discount_cutoff_date, discounted_fee').order('start_date'));
const coupons = must(await db.from('coupons').select('*'));
const codes = must(await db.from('codes').select('*'));
console.log(`${batches.length} batch(es), ${coupons.length} coupon(s), ${codes.filter((c) => c.discount_type && Number(c.discount_value) > 0).length} discounting code(s)${dryRun ? ' (dry run — nothing sent)' : ''}`);

const counts = { skus: 0, coupons: 0, codes: 0, redemptions: 0, failed: 0 };
const note = (r, what) => { if (r.ok) counts[what] += 1; else { counts.failed += 1; console.log(`  ${what} refused: ${r.status}`); } };

for (const b of batches) {
  const course = byCourse.get(b.course_id);
  if (!course) continue;
  const rules = [];
  if (!b.is_free && b.discount_cutoff_date && b.discounted_fee !== null) {
    rules.push({ kind: 'early_bird', unit_price_minor: minor(b.discounted_fee), min_qty: 1, ends_at: `${b.discount_cutoff_date}T23:59:59Z`, external_ref: `${b.id}:early_bird` });
  }
  note(await core('PUT', '/api/v1/service/catalogue/skus', {
    product: 'registration', kind: 'cohort_seat', code: skuCode(course.course_code, b.cohort_label), name: `${course.course_name} — ${b.cohort_label}`,
    price_minor: b.is_free ? 0 : minor(b.course_fee), currency: 'GHS',
    pricing: { unit: 'seat', start_date: b.start_date, end_date: b.end_date, unlisted: b.is_unlisted },
    external_ref: b.id, tax_treatment: 'none', valid_to: `${b.end_date}T23:59:59Z`, active: Boolean(b.is_active), rules,
  }), 'skus');
}

const couponBody = (row, externalRef, name) => {
  const course = row.applies_to_course_id ? byCourse.get(row.applies_to_course_id) : null;
  return {
    code: row.code, name, discount_type: row.discount_type, discount_value: Number(row.discount_value), product_scope: ['registration'],
    applies_to: course ? { code_prefixes: [prefix(course.course_code)] } : {}, max_uses: row.max_uses, one_per_subject: row.one_per_participant,
    starts_at: row.starts_at ?? null, expires_at: row.expires_at, is_active: row.is_active, external_ref: externalRef,
  };
};
for (const c of coupons) note(await core('PUT', '/api/v1/service/catalogue/coupons', couponBody(c, `coupon:${c.id}`, c.description ?? null)), 'coupons');
for (const c of codes) {
  if (!c.discount_type || !(Number(c.discount_value) > 0)) continue;
  note(await core('PUT', '/api/v1/service/catalogue/coupons', couponBody(c, `code:${c.id}`, 'Partner code')), 'codes');
}

if (!skipRedemptions) {
  const couponById = new Map(coupons.map((c) => [c.id, c]));
  const codeById = new Map(codes.map((c) => [c.id, c]));
  const couponRed = must(await db.from('coupon_redemptions').select('coupon_id, registration_id, participant_id, discount_amount_applied, applied_at_stage, applied_by_staff_id, id'));
  for (const r of couponRed) {
    const c = couponById.get(r.coupon_id);
    if (!c || !(Number(r.discount_amount_applied) > 0)) continue;
    note(await core('POST', '/api/v1/service/catalogue/coupons/redemptions', {
      code: c.code, product: 'registration', subject_type: 'participant', subject_id: r.participant_id, reference: r.registration_id,
      discount_minor: minor(r.discount_amount_applied), stage: r.applied_at_stage === 'post_registration' ? 'staff' : 'registration', applied_by: r.applied_by_staff_id, external_ref: `coupon_redemption:${r.id}`,
    }), 'redemptions');
  }
  const codeRed = must(await db.from('code_redemptions').select('code_id, registration_id, participant_id, discount_amount_applied, id'));
  for (const r of codeRed) {
    const c = codeById.get(r.code_id);
    if (!c || !(Number(r.discount_amount_applied) > 0)) continue;
    note(await core('POST', '/api/v1/service/catalogue/coupons/redemptions', {
      code: c.code, product: 'registration', subject_type: 'participant', subject_id: r.participant_id, reference: r.registration_id,
      discount_minor: minor(r.discount_amount_applied), stage: 'registration', applied_by: null, external_ref: `code_redemption:${r.id}`,
    }), 'redemptions');
  }
}
console.log(`synced skus ${counts.skus}, coupons ${counts.coupons}, codes ${counts.codes}, redemptions ${counts.redemptions}, failed ${counts.failed}`);
