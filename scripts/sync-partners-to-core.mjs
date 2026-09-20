// One-off: mirror this app's partners, their codes and their code redemptions
// into Knowsia Core's affiliates (Doc 22 §7 Phase 4 R4, 2026-09-19).
// Idempotent — Core keeps one partner per (product, external_ref), one code
// per code string and one attribution per (product, participant) — so it can
// be re-run after any gap. Runs AFTER sync-catalogue-to-core.mjs: a code that
// discounts names its Release 1 coupon (`code:<id>`), and a code whose coupon
// is not there yet is mirrored as attribution only. A redemption whose
// registration is Paid lands as `converted` through the Release 3 ledger
// (the backfill raised those payments; the affiliate consumer converts what
// it finds), so this script writes `tracked` rows only and lets the ledger
// do the rest. Loads .env.local itself and prints counts only, never a key.
//   node scripts/sync-partners-to-core.mjs [--dry-run]
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
const base = (process.env.KNOWSIA_APP_API_URL ?? '').replace(/\/+$/, '');
const key = process.env.KNOWSIA_APP_SERVICE_KEY;
if (!base || !key) throw new Error('KNOWSIA_APP_API_URL and KNOWSIA_APP_SERVICE_KEY are required');

async function core(method, path, body) {
  if (dryRun) return { ok: true, status: 0, json: async () => ({ id: 'dry-run', created: true, attributed: true }) };
  return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Service-Key': key }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };

const partners = must(await db.from('partners').select('id, category, full_name, email, phone, company_name, status').order('created_at'));
const codes = must(await db.from('codes').select('id, code, partner_id, discount_type, discount_value, max_uses, expires_at, is_active').not('partner_id', 'is', null).order('created_at'));
const redemptions = must(await db.from('code_redemptions').select('id, code_id, registration_id, participant_id, attribution_method, existing_lead_at_redemption, self_referral_at_redemption, created_at').order('created_at'));
const participants = new Map(must(await db.from('participants').select('id, email, phone, deleted_at').in('id', [...new Set(redemptions.map((r) => r.participant_id))])).map((p) => [p.id, p]));
const codeById = new Map(codes.map((c) => [c.id, c]));
console.log(`${partners.length} partner(s), ${codes.length} code(s), ${redemptions.length} redemption(s)${dryRun ? ' (dry run — nothing sent)' : ''}`);

const counts = { partners: 0, codes: 0, attributions: 0, repeats: 0, skipped: 0, failed: 0 };
for (const p of partners) {
  const r = await core('PUT', '/api/v1/service/affiliates/partners', {
    product: 'registration', external_ref: p.id,
    display_name: p.category === 'institutional' && p.company_name ? p.company_name : p.full_name,
    category: p.category, email: p.email, phone: p.phone, status: p.status,
    notes: p.category === 'institutional' && p.company_name ? `Contact: ${p.full_name}` : null,
  });
  if (!r.ok) { counts.failed += 1; console.log(`  partner refused: ${r.status}`); continue; }
  counts.partners += 1;
}
for (const c of codes) {
  const r = await core('PUT', '/api/v1/service/affiliates/codes', {
    product: 'registration', partner_external_ref: c.partner_id, code: c.code,
    coupon_external_ref: c.discount_type && c.discount_value ? `code:${c.id}` : null,
    product_scope: ['*'], is_active: c.is_active, expires_at: c.expires_at, max_uses: c.max_uses, external_ref: c.id,
  });
  if (r.status === 409) { counts.skipped += 1; console.log(`  code skipped: ${c.code} belongs to another partner in Core`); continue; }
  if (!r.ok) { counts.failed += 1; console.log(`  code refused: ${r.status}`); continue; }
  counts.codes += 1;
}
for (const red of redemptions) {
  const code = codeById.get(red.code_id); const p = participants.get(red.participant_id);
  if (!code || !p || p.deleted_at) { counts.skipped += 1; continue; }
  const r = await core('POST', '/api/v1/service/affiliates/attributions', {
    product: 'registration', code: code.code, subject_type: 'participant', subject_id: p.id, subject_email: p.email, subject_phone: p.phone,
    method: red.attribution_method === 'link' ? 'link' : 'code', existing_lead: red.existing_lead_at_redemption, self_referral: red.self_referral_at_redemption,
    external_ref: red.id, attributed_at: red.created_at,
  });
  if (!r.ok) { counts.failed += 1; console.log(`  attribution refused: ${r.status}`); continue; }
  const j = await r.json();
  if (!j.attributed) { counts.skipped += 1; console.log(`  attribution skipped: code ${code.code} not usable in Core (partner ${code.partner_id} not active?)`); continue; }
  counts[j.created ? 'attributions' : 'repeats'] += 1;
}
console.log(`synced partners ${counts.partners}, codes ${counts.codes}, attributions ${counts.attributions} (${counts.repeats} already there), skipped ${counts.skipped}, failed ${counts.failed}`);
if (!dryRun) console.log('Paid redemptions convert through the Release 3 ledger — run backfill-payments-to-core.mjs if it has not run since.');
