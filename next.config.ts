import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Retiring /programmes in favour of knowsia.com (founder decision 2026-08-05).
//
// knowsia.com becomes the canonical home for programme content; this app keeps
// only the transactional surface (/register and onward). Rather than deleting
// the pages, the redirect is gated behind an env flag so it can be switched on
// in Vercel the moment the WordPress catalogue is verified live — and switched
// back off just as fast if something is wrong there.
//
// DO NOT set this until knowsia.com/programmes and /programmes/{code} are
// actually serving. Enabling it early 301s real visitors into a 404, and 301s
// are aggressively cached by browsers.
//
// Set RETIRE_PROGRAMMES_REDIRECT=true in Vercel to activate.
//
// Note the per-code rule: published marketing collateral links directly to
// reg.knowsia.com/programmes/ESG1, /AI02, /ERM1 (see Coding Docs/*.md), so a
// bare /programmes redirect alone would strand every one of those links.
const RETIRE_PROGRAMMES = process.env.RETIRE_PROGRAMMES_REDIRECT === 'true';
const MARKETING_SITE = process.env.MARKETING_SITE_URL ?? 'https://knowsia.com';
// The path segment the WordPress catalogue lives on. Must match the plugin's
// KNOWSIA_PROGRAMMES_SLUG exactly — if the WordPress page is at
// /live-programmes and this still says /programmes, every redirected visitor
// lands on a 404. Kept as an env var so the two can be aligned without a code
// change, and so this app's own /programmes path (which is what is already
// indexed) does not have to change with it.
const MARKETING_PATH = (process.env.MARKETING_PROGRAMMES_PATH ?? '/programmes').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    if (!RETIRE_PROGRAMMES) return [];
    return [
      {
        source: '/programmes',
        destination: `${MARKETING_SITE}${MARKETING_PATH}`,
        permanent: true,
      },
      {
        source: '/programmes/:courseCode',
        destination: `${MARKETING_SITE}${MARKETING_PATH}/:courseCode`,
        permanent: true,
      },
    ];
  },
};

// Sentry wraps the config only to enable source-map upload and automatic
// instrumentation; with no SENTRY_DSN set (local dev) it is inert.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
