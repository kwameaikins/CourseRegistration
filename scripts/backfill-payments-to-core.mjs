// One-off: raise every past settled payment of this app onto Knowsia Core's
// ledger (Doc 22 §7 Phase 4 R3, 2026-09-19), one PAYMENT_SETTLED per
// payment_events row, keyed `registration:<registration>:<transaction id ??
// event id>` — the same key the live path uses, so the door answers
// `duplicate: true` for anything already there and the script is safe to
// re-run. Zero-amount events are skipped (a free seat is not revenue). Loads
// .env.local itself and prints counts only, never a key or an address.
//   node scripts/backfill-payments-to-core.mjs [--dry-run] [--since=2026-01-01]
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
const since = (process.argv.find((a) => a.startsWith('--since=')) ?? '--since=2026-01-01').slice('--since='.length);
const base = (process.env.KNOWSIA_APP_API_URL ?? '').replace(/\/+$/, '');
const key = process.env.KNOWSIA_APP_SERVICE_KEY;
if (!base || !key) throw new Error('KNOWSIA_APP_API_URL and KNOWSIA_APP_SERVICE_KEY are required');

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const skuCode = (courseCode, cohortLabel) => `cohort.${slug(courseCode)}.${slug(cohortLabel) || 'cohort'}`;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };

const events = must(await db.from('payment_events').select('id, registration_id, amount, transaction_id, recorded_at, source').gte('recorded_at', since).order('recorded_at'));
const regIds = [...new Set(events.map((e) => e.registration_id))];
const regs = new Map();
for (let i = 0; i < regIds.length; i += 200) {
  for (const r of must(await db.from('registrations').select('id, participant_id, batch_id, company_allocation_id').in('id', regIds.slice(i, i + 200)))) regs.set(r.id, r);
}
const participants = new Map(must(await db.from('participants').select('id, email, deleted_at').in('id', [...new Set([...regs.values()].map((r) => r.participant_id))])).map((p) => [p.id, p]));
const batches = new Map(must(await db.from('batches').select('id, course_id, cohort_label')).map((b) => [b.id, b]));
const courses = new Map(must(await db.from('courses').select('id, course_code')).map((c) => [c.id, c]));
const allocations = new Map(must(await db.from('company_batch_allocations').select('id, company_id')).map((a) => [a.id, a.company_id]));
console.log(`${events.length} payment event(s) since ${since}${dryRun ? ' (dry run — nothing sent)' : ''}`);

const counts = { raised: 0, duplicate: 0, skipped: 0, failed: 0 };
for (const e of events) {
  const reg = regs.get(e.registration_id); const p = reg ? participants.get(reg.participant_id) : null; const b = reg ? batches.get(reg.batch_id) : null; const c = b ? courses.get(b.course_id) : null;
  if (!reg || !p || p.deleted_at || !b || !c || !(Number(e.amount) > 0)) { counts.skipped += 1; continue; }
  if (dryRun) { counts.raised += 1; continue; }
  const r = await fetch(`${base}/api/v1/service/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
    body: JSON.stringify({
      product: 'registration', event_type: 'PAYMENT_SETTLED', idempotency_key: `registration:${reg.id}:${e.transaction_id ?? e.id}`, occurred_at: e.recorded_at, actor_ref: p.id,
      payload: { amount_minor: Math.round(Number(e.amount) * 100), currency: 'GHS', reference: e.transaction_id ?? e.id, email: p.email, participant_id: p.id, registration_id: reg.id,
                 sku_code: skuCode(c.course_code, b.cohort_label), organisation_ref: reg.company_allocation_id ? (allocations.get(reg.company_allocation_id) ?? null) : null, source: e.source },
    }),
  });
  if (!r.ok) { counts.failed += 1; console.log(`  refused: ${r.status}`); continue; }
  const j = await r.json();
  counts[j.duplicate ? 'duplicate' : 'raised'] += 1;
}
console.log(`raised ${counts.raised}, already there ${counts.duplicate}, skipped ${counts.skipped}, failed ${counts.failed}`);
