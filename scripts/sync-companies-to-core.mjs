// One-off: mirror this app's companies and seat allocations into Knowsia
// Core's organisations (Doc 22 §7 Phase 4 R2, 2026-09-19) and write the Core
// ids back as keys. Idempotent — Core keeps one organisation per
// (product, external_ref) and one deal per allocation id — so it can be
// re-run after any gap. Runs AFTER sync-catalogue-to-core.mjs: a deal names
// the batch's SKU, and a batch with no SKU yet is reported and skipped.
// Loads .env.local itself and prints counts only, never a key.
//   node scripts/sync-companies-to-core.mjs [--dry-run]
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

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const skuCode = (courseCode, cohortLabel) => `cohort.${slug(courseCode)}.${slug(cohortLabel) || 'cohort'}`;
const minor = (ghs) => Math.round(Number(ghs) * 100);

async function core(method, path, body) {
  if (dryRun) return { ok: true, status: 0, json: async () => ({ id: 'dry-run' }) };
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response;
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };

const companies = must(await db.from('companies').select('id, name, tin, billing_contact_name, billing_email, billing_phone, billing_address, notes, core_organisation_id').order('created_at'));
const allocations = must(await db.from('company_batch_allocations').select('id, company_id, batch_id, seats_purchased, price_per_seat, status, status_reason, notes, core_deal_id'));
const batches = new Map(must(await db.from('batches').select('id, course_id, cohort_label')).map((b) => [b.id, b]));
const courses = new Map(must(await db.from('courses').select('id, course_code')).map((c) => [c.id, c]));
console.log(`${companies.length} compan(ies), ${allocations.length} allocation(s)${dryRun ? ' (dry run — nothing sent)' : ''}`);

const counts = { organisations: 0, deals: 0, skipped: 0, failed: 0 };
const orgIds = new Map();
for (const c of companies) {
  const r = await core('PUT', '/api/v1/service/organisations', {
    product: 'registration', external_ref: c.id, name: c.name, kind: 'company', tin: c.tin, email: c.billing_email, phone: c.billing_phone,
    billing_contact: { name: c.billing_contact_name, email: c.billing_email, phone: c.billing_phone, address: c.billing_address ?? '' },
    address: c.billing_address, notes: c.notes,
  });
  if (!r.ok) { counts.failed += 1; console.log(`  organisation refused: ${r.status}`); continue; }
  const { id } = await r.json();
  orgIds.set(c.id, id);
  counts.organisations += 1;
  if (!dryRun && c.core_organisation_id !== id) must(await db.from('companies').update({ core_organisation_id: id }).eq('id', c.id));
}

for (const a of allocations) {
  const orgId = orgIds.get(a.company_id);
  const batch = batches.get(a.batch_id);
  const course = batch ? courses.get(batch.course_id) : null;
  if (!orgId || !batch || !course) { counts.skipped += 1; console.log(`  allocation skipped: company, batch or course not found`); continue; }
  const r = await core('PUT', `/api/v1/service/organisations/${orgId}/deals`, {
    product: 'registration', external_ref: a.id, sku_code: skuCode(course.course_code, batch.cohort_label), seats: a.seats_purchased,
    unit_price_minor: minor(a.price_per_seat), currency: 'GHS', status: a.status, status_reason: a.status_reason, notes: a.notes,
  });
  if (r.status === 422) { counts.skipped += 1; console.log(`  allocation skipped: the batch has no SKU in Core yet (run sync-catalogue-to-core.mjs first)`); continue; }
  if (!r.ok) { counts.failed += 1; console.log(`  deal refused: ${r.status}`); continue; }
  const { id } = await r.json();
  counts.deals += 1;
  if (!dryRun && a.core_deal_id !== id) must(await db.from('company_batch_allocations').update({ core_deal_id: id }).eq('id', a.id));
}
console.log(`synced organisations ${counts.organisations}, deals ${counts.deals}, skipped ${counts.skipped}, failed ${counts.failed}`);
