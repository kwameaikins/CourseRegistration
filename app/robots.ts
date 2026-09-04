import type { MetadataRoute } from 'next';

import { appUrl } from '@/lib/app-url';

// robots.txt (Revenue OS Phase 2, 2026-09-03). Public marketing pages are
// crawlable; staff screens, portals, APIs and tokenised pages are not — a
// feedback or unsubscribe URL in a search index would be a leak, not a win.

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/portal',
          '/company-portal',
          '/partner-portal',
          '/tutor-portal',
          '/feedback/',
          '/unsubscribe',
          '/dashboard',
          '/registrations',
          '/payments',
          '/leads',
          '/sales',
          '/campaigns',
          '/sequences',
          '/messaging',
          '/assistant',
          '/login',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
