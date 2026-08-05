// Shared auth + CORS for the public catalog API (2026-08-05).
//
// This is the first endpoint in this app that a THIRD PARTY calls
// server-to-server — knowsia.com (WordPress) pulls the live programme
// catalogue from here via wp_remote_get(). Everything else public in this app
// (/register, /verify, /news, /api/register/active-batches) is either a page
// or an open read with no caller identity at all.
//
// Two controls, and it is worth being precise about which one actually does
// the work:
//
//   * The BEARER TOKEN is the real security boundary. WordPress calls this
//     from PHP, server-side, where CORS does not apply and cannot protect
//     anything.
//   * CORS is defence-in-depth only. It stops a browser on some other origin
//     from reading responses via fetch(), which matters if the key ever leaks
//     into client-side code somewhere.
//
// The data behind this is already public (it is what /programmes renders to
// anonymous visitors), so a leaked key exposes nothing private. The key
// exists to keep the endpoint from being scraped or hammered by anyone who
// finds it, not to guard secrets.
import { AppError } from '@/lib/errors';

// Both hosts: knowsia.com is served on the apex and on www, and a CORS policy
// naming only one silently breaks the other.
const ALLOWED_ORIGINS = ['https://knowsia.com', 'https://www.knowsia.com'];

export function isCatalogApiConfigured(): boolean {
  return Boolean(process.env.CATALOG_API_KEY);
}

/**
 * Throws unless the request carries `Authorization: Bearer <CATALOG_API_KEY>`.
 * Mirrors the existing CRON_SECRET check on the cron routes rather than
 * inventing a second convention.
 *
 * Fails CLOSED when the key is unset: an unconfigured deployment must not
 * quietly serve the catalogue to everyone. That is the opposite of the
 * isR2Configured/isSmsConfigured gates elsewhere in this app, which degrade
 * open because a missing slip or SMS is a lost nicety — here the gate IS the
 * control, so absence has to mean "closed", not "off".
 */
export function assertCatalogApiKey(request: Request): void {
  // Trimmed on both sides. Pasting a secret into the Vercel dashboard or a
  // WordPress field very easily carries a trailing newline or space, and the
  // resulting 401 is indistinguishable from a genuinely wrong key — the
  // difference is invisible in both UIs. A shared secret has no meaningful
  // leading or trailing whitespace, so trimming costs nothing and removes a
  // whole class of unexplainable failure.
  const expected = process.env.CATALOG_API_KEY?.trim();
  if (!expected) {
    throw new AppError('UNAUTHENTICATED', 'Catalog API is not configured.', 401);
  }

  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or missing API key.', 401);
  }

  // Case-insensitive scheme match: the RFC treats the scheme token that way,
  // and some HTTP clients normalise it to 'bearer'.
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || match[1].trim() !== expected) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or missing API key.', 401);
  }
}

/**
 * CORS headers echoing the request origin only when it is on the allow-list.
 * Never `*` — that would let any page on the internet read the response.
 * A server-to-server caller sends no Origin at all, which is fine: it simply
 * gets no CORS headers back, and does not need them.
 */
export function catalogCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    // Tells shared caches that the response body varies by Origin, so one
    // origin's cached copy is never handed to another.
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

/** Preflight handler shared by both catalog routes. */
export function handleCatalogOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: catalogCorsHeaders(request) });
}

// WordPress adds its own 30–60s transient cache on top of this, so the data
// on knowsia.com is already not real-time. Accepting a short edge cache here
// too is therefore nearly free in freshness terms and takes the load off the
// database. Note this is a deliberate departure from the portal's own
// /programmes pages, which are intentionally uncached because they sit
// directly next to the registration form.
export const CATALOG_CACHE_CONTROL = 's-maxage=30, stale-while-revalidate=60';
