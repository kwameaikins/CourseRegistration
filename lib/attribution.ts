// First-touch campaign attribution (Revenue OS Phase 2, 2026-09-03).
//
// The contract for the `attribution` JSONB column on registrations, leads and
// waitlist_entries, and for the visitor cookie that feeds it. Captured
// client-side by components/AttributionCapture.tsx on the visitor's first
// arrival (the staff middleware never sees public traffic, so capture cannot
// live there); read server-side by the routes that create those rows.
//
// First-touch policy: once the cookie exists it is never overwritten. The
// question this data answers is "which campaign brought this person to us",
// and the first arrival is the honest answer to it.
import { z } from 'zod';

export const ATTRIBUTION_COOKIE = 'knowsia_attribution';
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

const trimmed = z
  .string()
  .trim()
  .max(300)
  .transform((value) => value || null)
  .nullable()
  .optional();

// Every field optional/nullable: a visitor arriving by direct traffic with no
// UTM still gets a cookie recording referrer/landing page, and a hand-crafted
// or truncated cookie must degrade to "no attribution", never to a 500 on the
// registration POST.
export const attributionSchema = z.object({
  utm_source: trimmed,
  utm_medium: trimmed,
  utm_campaign: trimmed,
  utm_term: trimmed,
  utm_content: trimmed,
  referrer: trimmed,
  landing_page: trimmed,
  first_seen_at: z.string().datetime().optional(),
});

export type Attribution = z.infer<typeof attributionSchema>;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

// Build an attribution record from a landing URL + referrer. Returns null when
// there is nothing worth recording (internal navigation, no UTMs, no external
// referrer) so the caller knows not to set a cookie at all.
export function buildAttribution(
  landingUrl: string,
  referrer: string,
  ownHost: string,
): Attribution | null {
  let url: URL;
  try {
    url = new URL(landingUrl);
  } catch {
    return null;
  }

  const record: Attribution = { first_seen_at: new Date().toISOString() };
  let hasSignal = false;

  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      record[key] = value.slice(0, 300);
      hasSignal = true;
    }
  }

  if (referrer) {
    try {
      const refHost = new URL(referrer).host;
      // An internal referrer is navigation, not acquisition.
      if (refHost && refHost !== ownHost) {
        record.referrer = referrer.slice(0, 300);
        hasSignal = true;
      }
    } catch {
      // Malformed referrer — ignore it, keep any UTM signal.
    }
  }

  if (!hasSignal) return null;

  record.landing_page = (url.pathname + url.search).slice(0, 300);
  return record;
}

// Parse the cookie value defensively: anything that does not validate is
// treated as absent. The cookie crosses the client/server boundary and its
// value is visitor-controlled input.
export function parseAttributionCookie(value: string | undefined | null): Attribution | null {
  if (!value) return null;
  try {
    const parsed = attributionSchema.safeParse(JSON.parse(decodeURIComponent(value)));
    if (!parsed.success) return null;
    // A record with no actual signal is noise — treat as absent.
    const { first_seen_at, ...signals } = parsed.data;
    void first_seen_at;
    return Object.values(signals).some(Boolean) ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeAttribution(attribution: Attribution): string {
  return encodeURIComponent(JSON.stringify(attribution));
}
