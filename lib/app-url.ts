// The single source of truth for "where does this deployment live".
//
// Domain consolidation (Coding Docs/20, 2026-09-04): this app moves from
// reg.knowsia.com to knowsia.com. Every link the app writes into an email, a
// PDF, an ICS invite, a sitemap or a canonical tag must follow that move on
// the day it happens, with one env var change and no code change. That is
// only true if nothing in the codebase spells the host out itself — so every
// former literal now comes through here. The default stays reg.knowsia.com
// until the cutover flips NEXT_PUBLIC_APP_URL in Vercel.
//
// Read at call time, not module load: tests set the env per case, and the
// cron worker and scripts import this too.

export const DEFAULT_APP_URL = 'https://reg.knowsia.com';

/** Absolute origin with no trailing slash, e.g. `https://reg.knowsia.com`. */
export function appUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\s+/g, '');
  const candidate = raw || DEFAULT_APP_URL;
  return candidate.replace(/\/+$/, '');
}

/**
 * The host as a person reads it — `reg.knowsia.com` today, `knowsia.com`
 * after cutover. For printed footers and "verify at ..." copy, never for
 * building URLs (use appUrl for those).
 */
export function appHost(): string {
  try {
    return new URL(appUrl()).host;
  } catch {
    return new URL(DEFAULT_APP_URL).host;
  }
}
