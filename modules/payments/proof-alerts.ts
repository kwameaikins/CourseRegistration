// Finance alerts for MoMo / bank-transfer payment proofs (founder decision
// 2026-10-16). A proof used to wait silently in the review queue until
// someone looked; with proofs now sent from app.knowsia.com as well as the
// portal, each one emails the team the moment it arrives, and the 07:00 run
// lists any still waiting after 24 hours so nothing is forgotten.
//
// Both go to ORGANISATION_EMAIL (info@knowsia.com) unless
// PAYMENT_PROOF_ALERT_EMAIL is set. Each send carries an idempotency key —
// `payment_proof_alert:<submission id>` and `payment_proof_reminder:<date>` —
// so a retry never mails twice. Neither ever fails the student's submission
// or the cron: errors go to Sentry.
import { appUrl } from '@/lib/app-url';
import { captureToSentry } from '@/lib/errors';
import { ORGANISATION_EMAIL } from '@/lib/organisation';
import { sendTransactionalEmail } from '@/lib/resend/client';

import { flagWords, type ProofFlag } from './proof-controls';
import * as paymentsRepository from './repository';
import type { PaymentSubmission } from './types';

export const REMINDER_AFTER_HOURS = 24;

export function proofAlertRecipient(): string {
  return (process.env.PAYMENT_PROOF_ALERT_EMAIL ?? '').trim() || ORGANISATION_EMAIL;
}

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ghs(amount: number | string): string {
  return `GH₵ ${Number(amount).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function queueUrl(): string {
  return `${appUrl()}/payments?view=submissions`;
}

type Context = { participantName: string; courseName: string; cohortLabel: string };

/** The alert for one new proof. Pure, so it can be tested as written. */
export function proofAlertEmail(s: PaymentSubmission, ctx: Context | undefined, flags: ProofFlag[] = []): { subject: string; html: string } {
  const who = ctx?.participantName || 'A student';
  const warning = flags.length
    ? `<p style="background:#fdecea;border:1px solid #e0a39b;padding:10px;color:#8a1f11"><strong>Check carefully:</strong> ${flagWords(flags).map(esc).join(' ')} ` +
      'A Paystack MoMo payment goes to Paystack, not into our MoMo wallet — approve only if this money is on our own statement as a separate payment.</p>'
    : '';
  const course = [ctx?.courseName, ctx?.cohortLabel].filter(Boolean).join(' · ');
  const rows: Array<[string, string]> = [
    ['Student', who],
    ['Class', course || '—'],
    ['Amount', ghs(s.amount)],
    ['Method', s.method],
    ['Reference', s.transactionReference || 'not given'],
    ['Date paid', s.paymentDate],
    ['Slip', s.hasSlip ? 'attached — open it from the review queue' : 'none'],
  ];
  if (s.participantNotes) rows.push(['Note from the student', s.participantNotes]);
  return {
    subject: `${flags.length ? '⚠ Possible duplicate — ' : ''}Payment to confirm: ${who} · ${ghs(s.amount)} by ${s.method}`,
    html: `${warning}
<p>A student has told us they paid by ${esc(s.method === 'Bank Transfer' ? 'bank transfer' : 'Mobile Money')}. Please find it on our MoMo / bank statement, then approve or reject it — their access waits on it.</p>
<table cellpadding="6" style="border-collapse:collapse">
${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('\n')}
</table>
<p><a href="${esc(queueUrl())}">Open the review queue</a></p>
<p style="color:#777;font-size:12px">Sent once per submission. Anything still waiting after ${REMINDER_AFTER_HOURS} hours is listed again in the 07:00 reminder.</p>`,
  };
}

/** Email the team about one new proof. Never throws. */
export async function alertFinanceOfPaymentProof(s: PaymentSubmission, flags: ProofFlag[] = []): Promise<void> {
  try {
    const ctx = (await paymentsRepository.selectPaymentSubmissionContextSystem([s.registrationId])).get(s.registrationId);
    const { subject, html } = proofAlertEmail(s, ctx, flags);
    await sendTransactionalEmail({
      to: proofAlertRecipient(),
      subject,
      html,
      category: 'system',
      templateKey: 'payment_proof_alert',
      idempotencyKey: `payment_proof_alert:${s.id}`,
    });
  } catch (err) {
    captureToSentry(err, { job: 'payment_proof_alert', submissionId: s.id });
  }
}

/** The 07:00 list of proofs still waiting after a day. Pure. */
export function proofReminderEmail(
  waiting: Array<{ id: string; registrationId: string; amount: number; method: string; createdAt: string }>,
  context: Map<string, Context>,
  now: Date,
): { subject: string; html: string } {
  const hours = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  const items = waiting
    .map((w) => {
      const c = context.get(w.registrationId);
      const age = hours(w.createdAt);
      const waited = age >= 48 ? `${Math.floor(age / 24)} days` : `${age} hours`;
      return `<li><strong>${esc(c?.participantName || 'A student')}</strong> — ${esc(ghs(w.amount))} by ${esc(w.method)}${c?.courseName ? `, ${esc(c.courseName)}` : ''} (waiting ${esc(waited)})</li>`;
    })
    .join('\n');
  const n = waiting.length;
  return {
    subject: `${n} payment${n === 1 ? '' : 's'} still waiting to be confirmed`,
    html: `
<p>${n === 1 ? 'This payment has' : 'These payments have'} been waiting more than ${REMINDER_AFTER_HOURS} hours for review. Each student's access waits on it.</p>
<ul>
${items}
</ul>
<p><a href="${esc(queueUrl())}">Open the review queue</a></p>`,
  };
}

/** Called by the daily 07:00 cron. Sends nothing when nothing is waiting. */
export async function runPendingProofReminder(now: Date = new Date()): Promise<{ waiting: number; sent: boolean }> {
  try {
    const cutoff = new Date(now.getTime() - REMINDER_AFTER_HOURS * 3_600_000).toISOString();
    const rows = await paymentsRepository.selectPendingPaymentSubmissionsBeforeSystem(cutoff);
    if (rows.length === 0) return { waiting: 0, sent: false };
    const context = await paymentsRepository.selectPaymentSubmissionContextSystem([...new Set(rows.map((r) => r.registration_id))]);
    const { subject, html } = proofReminderEmail(
      rows.map((r) => ({ id: r.id, registrationId: r.registration_id, amount: Number(r.amount), method: r.method, createdAt: r.created_at })),
      context,
      now,
    );
    await sendTransactionalEmail({
      to: proofAlertRecipient(),
      subject,
      html,
      category: 'system',
      templateKey: 'payment_proof_reminder',
      idempotencyKey: `payment_proof_reminder:${now.toISOString().slice(0, 10)}`,
    });
    return { waiting: rows.length, sent: true };
  } catch (err) {
    captureToSentry(err, { job: 'payment_proof_reminder' });
    return { waiting: 0, sent: false };
  }
}
