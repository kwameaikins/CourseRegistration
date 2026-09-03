'use client';

// First-touch attribution capture (Revenue OS Phase 2, 2026-09-03).
//
// Runs on every page via the root layout, but only ever WRITES once: the
// cookie is first-touch and never overwritten. Capture must be client-side —
// middleware.ts matches staff routes only and redirects anonymous visitors,
// so it can never observe public traffic.
//
// The cookie is deliberately NOT httpOnly: it carries no secret (campaign
// tags the visitor arrived with), and client-side capture requires JS writes.
import { useEffect } from 'react';

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  buildAttribution,
  serializeAttribution,
} from '@/lib/attribution';

export function AttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split('; ').some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`))) {
        return; // first touch already recorded
      }
      const attribution = buildAttribution(
        window.location.href,
        document.referrer,
        window.location.host,
      );
      if (!attribution) return; // direct, untagged traffic — nothing to record
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie =
        `${ATTRIBUTION_COOKIE}=${serializeAttribution(attribution)}` +
        `; Max-Age=${ATTRIBUTION_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Attribution is a nice-to-have; it must never break a page.
    }
  }, []);

  return null;
}
