// Read-only: participants whose name matches, with their registrations.
// Loads .env.local itself and prints only the query results â€” never a key.
//   node scripts/find-participant.mjs "kpodo"
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
const needle = process.argv[2];
if (!needle) throw new Error('usage: find-participant.mjs <name fragment>');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const words = needle.toLowerCase().split(/\s+/).filter(Boolean);
const { data: people, error } = await db
  .from('participants')
  .select('id, full_name, email, phone, deleted_at, created_at')
  .or(words.map((w) => `full_name.ilike.%${w}%`).join(','))
  .order('created_at');
if (error) throw error;
console.log(`${people.length} participant row(s) matching "${needle}"`);
for (const p of people) {
  const { data: regs, error: regError } = await db
    .from('registrations')
    .select('registration_status, registered_at, batch_id')
    .eq('participant_id', p.id)
    .order('registered_at');
  console.log(`\n- ${p.full_name} | ${p.email} | ${p.phone} | created ${p.created_at.slice(0, 10)}${p.deleted_at ? ' | DELETED' : ''}`);
  if (regError) console.log(`    registrations: ${regError.message}`);
  for (const r of regs ?? []) {
    const { data: b } = await db.from('batches').select('cohort_label, course_id').eq('id', r.batch_id).maybeSingle();
    const { data: c } = b ? await db.from('courses').select('course_code, course_name').eq('id', b.course_id).maybeSingle() : { data: null };
    console.log(`    ${r.registered_at.slice(0, 10)}  ${r.registration_status.padEnd(10)} ${c?.course_code ?? '?'} ${c?.course_name ?? ''} (${b?.cohort_label ?? '?'})`);
  }
  const { data: portal, error: portalError } = await db.from('portal_accounts').select('created_at').eq('participant_id', p.id);
  console.log(`    portal account: ${portalError ? portalError.message : portal.length ? 'yes' : 'no'}`);
}


