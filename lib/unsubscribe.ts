// Unsubscribe links (Revenue OS Phase 2, 2026-09-03).
//
// The link carries the email plus an HMAC of it, so the public endpoint can
// trust "this address asked out" without a database of one-time tokens: the
// only party who can mint a valid token is the holder of the secret, and the
// worst a tampered link can do is fail verification. Deliberately not
// time-limited — an unsubscribe link in a months-old email must still work;
// that is the whole compliance point.
import { createHmac, timingSafeEqual } from 'crypto';

import { appUrl } from '@/lib/app-url';

function secret(): string {
  // Falls back to the service-role key: always present, never client-exposed.
  const value =
    process.env.UNSUBSCRIBE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!value) {
    throw new Error('No UNSUBSCRIBE_SECRET or SUPABASE_SERVICE_ROLE_KEY configured.');
  }
  return value;
}

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', secret())
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  try {
    const expected = Buffer.from(unsubscribeToken(email));
    const provided = Buffer.from(token);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function unsubscribeLink(email: string): string {
  const base = appUrl();
  const normalized = email.trim().toLowerCase();
  return `${base}/unsubscribe?e=${encodeURIComponent(normalized)}&t=${unsubscribeToken(normalized)}`;
}

// Appended to every MARKETING email (campaigns, nurture sequences, upsell).
// Transactional lifecycle emails are exempt and never carry it.
export function unsubscribeFooterHtml(email: string): string {
  // Never let a missing secret fail a send that was otherwise ready — an
  // email without a footer beats an email that never left.
  try {
    return (
      `<p style="margin-top:24px;font-size:12px;color:#888">` +
      `You are receiving this because you registered interest with Knowsia. ` +
      `<a href="${unsubscribeLink(email)}" style="color:#888">Unsubscribe from marketing emails</a>.` +
      `</p>`
    );
  } catch (err) {
    console.error('[unsubscribe footer]', err);
    return '';
  }
}
