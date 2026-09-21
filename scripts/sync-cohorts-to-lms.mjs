// One-off: mirror this app's batches into Knowsia LMS cohorts and every
// confirmed registration into a seat (Coding Docs/26 R1, 2026-09-21).
// Idempotent — the LMS keeps one cohort per (product, external_ref) and one
// seat per (cohort, registration id) — so it can be re-run after any gap.
// A seat carries the personal Zoom link this app minted (dual run); a
// registration whose batch has ended more than 90 days ago is skipped, its
// seat would already have expired. Loads .env.local itself and prints
// counts only, never a key.
//   node scripts/sync-cohorts-to-lms.mjs [--dry-run] [--batch <id>] [--since YYYY-MM-DD]
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
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyBatch = args.includes('--batch') ? args[args.indexOf('--batch') + 1] : null;
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const base = (process.env.KNOWSIA_LMS_API_URL || process.env.KNOWSIA_APP_API_URL || '').trim().replace(/\/+$/, '');
const key = process.env.KNOWSIA_APP_SERVICE_KEY;
if (!base || !key) throw new Error('KNOWSIA_LMS_API_URL (or KNOWSIA_APP_API_URL) and KNOWSIA_APP_SERVICE_KEY are required');

async function lms(method, path, body) {
  if (dryRun) return { ok: true, status: 0, json: async () => ({ cohort_id: 'dry-run', created: true, id: 'dry-run' }) };
  return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Service-Key': key }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };

let batchQuery = db.from('batches').select('*').gte('end_date', since).order('start_date');
if (onlyBatch) batchQuery = db.from('batches').select('*').eq('id', onlyBatch);
const batches = must(await batchQuery);
const courses = new Map(must(await db.from('courses').select('id, course_code, course_name')).map((c) => [c.id, c]));
const tutors = new Map(must(await db.from('tutors').select('id, full_name, email, phone')).map((t) => [t.id, t]));
const counts = { batches: 0, cohorts_created: 0, cohorts_updated: 0, seats: 0, seats_created: 0, skipped: 0, failed: 0 };

for (const b of batches) {
  const course = courses.get(b.course_id);
  if (!course) { counts.skipped += 1; continue; }
  counts.batches += 1;
  const mirror = await lms('PUT', '/api/v1/service/lms/cohorts', {
    external_ref: b.id, course_code: course.course_code, course_title: course.course_name, title: `${course.course_name} — ${b.cohort_label}`,
    start_date: b.start_date, end_date: b.end_date, start_time: b.start_time, end_time: b.end_time, meeting_days: b.meeting_days, timezone: 'Africa/Accra',
    tutor_name: tutors.get(b.facilitator_tutor_id)?.full_name || b.facilitator_name || null, tutor_email: tutors.get(b.facilitator_tutor_id)?.email ?? null, tutor_phone: tutors.get(b.facilitator_tutor_id)?.phone ?? null, max_seats: b.capacity ?? undefined, is_free: b.is_free, is_unlisted: b.is_unlisted, is_active: b.is_active,
    reminders_enabled: b.class_reminder_enabled, zoom_meeting_id: b.zoom_meeting_id, zoom_join_url: b.zoom_link, zoom_access_revoked_at: b.zoom_access_revoked_at,
    whatsapp_group_url: b.whatsapp_group_link, resources_url: b.resources_link,
  });
  if (!mirror.ok) { counts.failed += 1; console.error(`batch ${b.id}: ${mirror.status}`); continue; }
  const m = await mirror.json();
  if (m.created) counts.cohorts_created += 1; else counts.cohorts_updated += 1;

  const regs = must(await db.from('registrations').select('id, participant_id, registration_status').eq('batch_id', b.id).eq('registration_status', 'Confirmed'));
  if (regs.length === 0) continue;
  const participants = new Map(must(await db.from('participants').select('id, email, full_name, phone, deleted_at').in('id', regs.map((r) => r.participant_id))).map((p) => [p.id, p]));
  const payments = new Map(must(await db.from('payments').select('registration_id, payment_status').in('registration_id', regs.map((r) => r.id))).map((p) => [p.registration_id, p.payment_status]));
  const registrants = new Map(must(await db.from('zoom_registrants').select('registration_id, zoom_registrant_id, join_url').in('registration_id', regs.map((r) => r.id))).map((z) => [z.registration_id, z]));
  for (const r of regs) {
    const p = participants.get(r.participant_id);
    if (!p || p.deleted_at) { counts.skipped += 1; continue; }
    const z = registrants.get(r.id);
    const source = b.is_free ? 'free' : payments.get(r.id) === 'Paid' ? 'paid' : 'grant';
    const seat = await lms('POST', `/api/v1/service/lms/cohorts/${encodeURIComponent(b.id)}/members`, {
      email: p.email, name: p.full_name, phone: p.phone ?? null, participant_id: p.id, external_ref: r.id, seat_source: source,
      zoom_registrant_id: z?.zoom_registrant_id ?? null, zoom_join_url: z?.join_url ?? null,
    });
    if (!seat.ok) { counts.failed += 1; console.error(`registration ${r.id}: ${seat.status}`); continue; }
    counts.seats += 1;
    if ((await seat.json()).created) counts.seats_created += 1;
  }
}
console.log(dryRun ? '[dry run]' : '', JSON.stringify(counts));
