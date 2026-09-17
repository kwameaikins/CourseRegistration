// Reset a participant's portal PIN to the last four digits of their mobile
// number (the portal's own initial-PIN convention), force a change on first
// sign-in, clear any lockout, and tell them by email and SMS.
// Loads .env.local itself; prints outcomes only — never a key, never the PIN.
//   node scripts/reset-participant-pin.mjs <email> [--send] [--note="<one sentence for the email>"]
import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* absent */ }
}

const email = process.argv[2];
const send = process.argv.includes('--send');
// Optional: what changed about the account, said in the email (e.g. a merge).
const noteArg = process.argv.find((a) => a.startsWith('--note='));
const note = noteArg ? noteArg.slice(7) : '';
if (!email) throw new Error('usage: reset-participant-pin.mjs <email> [--send]');

// Same algorithm as lib/portal-auth/pin.ts (scrypt, 16-byte salt, 64-byte key).
function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 64).toString('hex')}`;
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: p, error } = await db.from('participants').select('id, full_name, email, phone, deleted_at').eq('email', email).maybeSingle();
if (error) throw error;
if (!p) throw new Error(`no participant with email ${email}`);
if (p.deleted_at) throw new Error(`${email} is a deleted participant — refusing`);
const digits = p.phone.replace(/\D/g, '');
if (digits.length < 4) throw new Error('phone has fewer than four digits');
const pin = digits.slice(-4);

const { data: auth } = await db.from('participant_auth').select('participant_id, must_change_pin, failed_attempts, locked_until').eq('participant_id', p.id).maybeSingle();
const row = { pin_hash: hashPin(pin), must_change_pin: true, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() };
const write = auth
  ? db.from('participant_auth').update(row).eq('participant_id', p.id)
  : db.from('participant_auth').insert({ participant_id: p.id, ...row });
const { error: writeError } = await write;
if (writeError) throw writeError;
console.log(`${p.full_name} <${p.email}>: PIN reset to the last four digits of ${p.phone.replace(/\d(?=\d{4})/g, '•')}, must change on next sign-in, lockout cleared (${auth ? 'updated' : 'created'} auth row)`);

if (!send) { console.log('(no messages sent — pass --send)'); process.exit(0); }

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com').replace(/\/+$/, '');
const first = p.full_name.split(' ')[0];

// Email — Resend, the same sender the portal's own PIN-reset email uses.
const { Resend } = await import('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.RESEND_FROM_EMAIL.includes('<') ? process.env.RESEND_FROM_EMAIL : `Knowsia <${process.env.RESEND_FROM_EMAIL}>`;
const { error: mailError } = await resend.emails.send({
  from,
  to: p.email,
  subject: 'Your Knowsia student PIN has been reset',
  html: `
<p>Dear ${first},</p>
<p>${note || `We found two accounts under your name and have kept this one, <b>${p.email}</b>. The other has been removed, so please use this address from now on.`}</p>
<p>Your student portal PIN has been reset. To sign in:</p>
<ol>
  <li>Go to <a href="${appUrl}/portal/login">${appUrl.replace(/^https?:\/\//, '')}/portal/login</a></li>
  <li>Enter your email address or mobile number</li>
  <li>As your PIN, enter the <b>last four digits of your mobile number</b></li>
</ol>
<p>You will be asked to choose a new PIN the first time you sign in. Please do that straight away.</p>
<p>The same email or mobile number and PIN also sign you in to the question bank at <a href="${appUrl}/learn">${appUrl.replace(/^https?:\/\//, '')}/learn</a> — choose the <b>Student PIN</b> tab.</p>
<p>If anything does not work, reply to this email or WhatsApp 053 053 1328.</p>
<p>Knowsia</p>`,
});
console.log('email:', mailError ? `FAILED — ${mailError.message}` : `sent to ${p.email}`);

// SMS — Arkesel, the same endpoint and sender ID as lib/arkesel/client.ts.
const to = p.phone.replace(/\D/g, '').replace(/^0/, '233');
const sms = `Knowsia: your student portal PIN has been reset. Sign in at ${appUrl.replace(/^https?:\/\//, '')}/portal/login with your mobile number and, as PIN, the last 4 digits of your mobile number. You will then choose a new PIN. Use the email ${p.email}.`;
if (!process.env.ARKESEL_API_KEY || !process.env.ARKESEL_SENDER_ID) {
  console.log('sms: not configured');
} else {
  const r = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
    method: 'POST',
    headers: { 'api-key': process.env.ARKESEL_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: process.env.ARKESEL_SENDER_ID, message: sms, recipients: [to] }),
  });
  const body = await response_text(r);
  console.log('sms:', r.ok ? `sent to ${to.replace(/\d(?=\d{4})/g, '•')}` : `FAILED — ${r.status} ${body.slice(0, 200)}`);
}

async function response_text(r) { try { return await r.text(); } catch { return ''; } }
