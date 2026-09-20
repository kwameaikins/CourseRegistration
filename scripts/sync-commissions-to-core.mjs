// One-off: carry this app's commission history into Knowsia Core (Doc 25 §2,
// decision 9) so no partner's record moves when Core becomes the ledger.
// Each `partner_commissions` row becomes a core_commissions row with the SAME
// status (pending → pending, approved, payable, paid, clawed_back → reversed,
// redeemed) keyed by external_ref = this row's id; each `partner_payouts` row
// a core_payouts row. Idempotent: a row already carried is skipped. Runs
// AFTER sync-partners-to-core.mjs (the partner and the attribution must be
// there — a commission needs its attribution's id). Loads .env.local itself
// and prints counts only, never a key.
//   node scripts/sync-commissions-to-core.mjs [--dry-run]
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
const minor = (ghs) => Math.round(Number(ghs) * 100);
const STATUS = { pending: 'pending', approved: 'approved', payable: 'payable', paid: 'paid', clawed_back: 'reversed', redeemed: 'redeemed' };

async function core(method, path, body) {
  if (dryRun) return { ok: true, status: 0, json: async () => ({ id: 'dry-run', created: true }) };
  return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Service-Key': key }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };

const commissions = must(await db.from('partner_commissions').select('id, partner_id, registration_id, code_redemption_id, commission_amount, status, qualifies_at, approved_at, marked_payable_at, paid_at, payout_id, clawback_reason, redeemed_against_registration_id, created_at').order('created_at'));
const payouts = must(await db.from('partner_payouts').select('id, partner_id, total_amount, method, reference, paid_at, created_at').order('created_at'));
const payments = new Map(must(await db.from('payments').select('registration_id, transaction_id, amount_paid')).map((p) => [p.registration_id, p]));
console.log(`${commissions.length} commission(s), ${payouts.length} payout(s)${dryRun ? ' (dry run — nothing sent)' : ''}`);

const counts = { commissions: 0, payouts: 0, skipped: 0, failed: 0 };
for (const c of commissions) {
  const pay = payments.get(c.registration_id);
  const r = await core('POST', '/api/v1/service/affiliates/commissions/import', {
    product: 'registration', partner_external_ref: c.partner_id, attribution_external_ref: c.code_redemption_id, external_ref: c.id,
    payment_reference: pay?.transaction_id ?? `reg:${c.registration_id}`, base_minor: minor(pay?.amount_paid ?? 0), amount_minor: minor(c.commission_amount),
    status: STATUS[c.status] ?? 'pending', qualifies_at: c.qualifies_at, approved_at: c.approved_at, payable_at: c.marked_payable_at, paid_at: c.paid_at,
    reason: c.clawback_reason, redeemed_ref: c.redeemed_against_registration_id, created_at: c.created_at,
  });
  if (r.status === 404) { counts.skipped += 1; console.log(`  commission ${c.id} skipped: partner or attribution not in Core yet (run sync-partners-to-core.mjs first)`); continue; }
  if (!r.ok) { counts.failed += 1; console.log(`  commission refused: ${r.status}`); continue; }
  counts.commissions += 1;
}
for (const p of payouts) {
  const ids = commissions.filter((c) => c.payout_id === p.id).map((c) => c.id);
  const r = await core('POST', '/api/v1/service/affiliates/payouts/import', {
    product: 'registration', partner_external_ref: p.partner_id, external_ref: p.id, total_minor: minor(p.total_amount), method: 'manual',
    reference: p.reference ?? p.method, commission_external_refs: ids, paid_at: p.paid_at, created_at: p.created_at,
  });
  if (r.status === 404) { counts.skipped += 1; continue; }
  if (!r.ok) { counts.failed += 1; console.log(`  payout refused: ${r.status}`); continue; }
  counts.payouts += 1;
}
console.log(`carried commissions ${counts.commissions}, payouts ${counts.payouts}, skipped ${counts.skipped}, failed ${counts.failed}`);
