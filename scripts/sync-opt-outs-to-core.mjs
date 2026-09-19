// One-off: copy this app's marketing opt-outs into Knowsia Core's suppression
// list (Doc 23 §3, 2026-09-19), so a person who unsubscribed here is not
// marketed to from Knowsia Study either. Idempotent — Core keeps one row per
// (channel, address) and a repeat only updates the reason. Loads .env.local
// itself and prints counts only, never a key or an address.
//   node scripts/sync-opt-outs-to-core.mjs [--dry-run]
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

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: rows, error } = await db.from('marketing_opt_outs').select('email, source, reason, created_at').order('created_at');
if (error) throw error;
console.log(`${rows.length} opt-out row(s) here${dryRun ? ' (dry run — nothing sent)' : ''}`);

let ok = 0;
let failed = 0;
for (const row of rows) {
  if (dryRun) continue;
  const reason = row.source === 'bounce' ? 'bounce' : row.source === 'staff' ? 'staff' : 'unsubscribe';
  const response = await fetch(`${base}/api/v1/service/messages/suppressions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
    body: JSON.stringify({ channel: 'email', address: row.email, reason, source: `registration_${row.source ?? 'link'}`, detail: row.reason ?? null }),
  });
  if (response.ok) ok += 1;
  else {
    failed += 1;
    console.log(`  one row refused: ${response.status}`);
  }
}
console.log(`synced ${ok}, failed ${failed}`);
