// Merge one participant into another: every registration (and so its
// attendance, payments, certificates, materials access, feedback, logs)
// moves to the surviving row, leftovers on the old row are re-pointed or
// dropped, and the old row is soft-deleted as the app's erasure does it.
// Dry run by default; `--apply` writes.
//   node scripts/merge-participant.mjs <from-email> <into-email> [--apply]
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
const [fromEmail, intoEmail] = process.argv.slice(2);
const apply = process.argv.includes('--apply');
if (!fromEmail || !intoEmail) throw new Error('usage: merge-participant.mjs <from-email> <into-email> [--apply]');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function one(table, col, value) {
  const { data, error } = await db.from(table).select('*').eq(col, value).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const from = await one('participants', 'email', fromEmail);
const into = await one('participants', 'email', intoEmail);
if (!from || !into) throw new Error('both participants must exist');
if (from.deleted_at) throw new Error(`${fromEmail} is already deleted`);
if (into.deleted_at) throw new Error(`${intoEmail} is deleted — refusing to merge into it`);
console.log(`FROM ${from.full_name} <${from.email}> ${from.phone}\nINTO ${into.full_name} <${into.email}> ${into.phone}\n`);

const { data: fromRegs } = await db.from('registrations').select('id, batch_id, registration_status').eq('participant_id', from.id);
const { data: intoRegs } = await db.from('registrations').select('id, batch_id').eq('participant_id', into.id);
const intoBatches = new Set((intoRegs ?? []).map((r) => r.batch_id));
for (const r of fromRegs ?? []) {
  const { data: b } = await db.from('batches').select('cohort_label, course_id').eq('id', r.batch_id).maybeSingle();
  const { data: c } = b ? await db.from('courses').select('course_code').eq('id', b.course_id).maybeSingle() : { data: null };
  const clash = intoBatches.has(r.batch_id);
  console.log(`registration ${r.id.slice(0, 8)} ${c?.course_code ?? '?'} (${b?.cohort_label ?? '?'}) ${r.registration_status}${clash ? '  <-- INTO already registered for this batch' : '  -> move'}`);
  if (clash) throw new Error('a registration clashes; resolve by hand');
}

const repoint = ['leads', 'waitlist_entries', 'coupon_redemptions', 'coupon_attempt_log', 'code_redemptions'];
const drop = ['participant_sessions', 'portal_login_tokens', 'participant_pin_reset_tokens', 'knowsia_app_handoff_tokens', 'participant_auth'];
const counts = {};
for (const t of [...repoint, ...drop]) {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true }).eq('participant_id', from.id);
  counts[t] = error ? `error: ${error.message}` : count;
}
console.log('\nrows on the old participant:', JSON.stringify(counts));

const regIds = (fromRegs ?? []).map((r) => r.id);
const { data: certs } = regIds.length ? await db.from('certificates').select('id, recipient_email, registration_id').in('registration_id', regIds) : { data: [] };
const { data: nurture } = await db.from('nurture_enrollments').select('id, email').eq('email', from.email);
console.log(`certificates on moving registrations: ${certs?.length ?? 0} (recipient_email -> ${into.email})`);
console.log(`nurture enrolments under the old email: ${nurture?.length ?? 0} (email -> ${into.email})`);

if (!apply) { console.log('\nDRY RUN — nothing written. Pass --apply.'); process.exit(0); }

const fail = (t, e) => { if (e) throw new Error(`${t}: ${e.message}`); };
for (const r of fromRegs ?? []) {
  const { error } = await db.from('registrations').update({ participant_id: into.id, updated_at: new Date().toISOString() }).eq('id', r.id);
  fail('registrations', error);
}
for (const t of repoint) {
  if (typeof counts[t] === 'number' && counts[t] > 0) {
    const { error } = await db.from(t).update({ participant_id: into.id }).eq('participant_id', from.id);
    fail(t, error);
  }
}
for (const t of drop) {
  if (typeof counts[t] === 'number' && counts[t] > 0) {
    const { error } = await db.from(t).delete().eq('participant_id', from.id);
    fail(t, error);
  }
}
if (certs?.length) {
  const { error } = await db.from('certificates').update({ recipient_email: into.email }).in('id', certs.map((c) => c.id));
  fail('certificates', error);
}
if (nurture?.length) {
  const { error } = await db.from('nurture_enrollments').update({ email: into.email }).in('id', nurture.map((n) => n.id));
  fail('nurture_enrollments', error);
}
{
  const { error } = await db.from('participants').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', from.id);
  fail('participants', error);
}
console.log(`\nDONE — ${fromRegs?.length ?? 0} registration(s) moved to ${into.email}; ${from.email} soft-deleted.`);
