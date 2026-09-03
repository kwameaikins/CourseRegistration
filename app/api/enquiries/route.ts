import { cookies } from 'next/headers';

import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '@/lib/attribution';
import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import { enquiryInputSchema } from '@/modules/leads/types';

// POST /api/enquiries — public top-funnel capture (Revenue OS Phase 2,
// 2026-09-03). Turns "I have a question about this course" into a lead with
// attribution attached, instead of letting the visitor evaporate.

// First-line abuse controls, deliberately modest: a honeypot field bots fill
// and humans never see, plus a per-IP window. In-memory state is per serverless
// instance — a determined abuser gets past it, a dumb script does not, and the
// blast radius of getting past it is junk lead rows, not money or data.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(ip, hits);
    return true;
  }
  hits.push(now);
  recent.set(ip, hits);
  // Bounded memory: prune occasionally rather than per-request bookkeeping.
  if (recent.size > 5000) {
    for (const [key, times] of recent) {
      if (times.every((t) => now - t >= WINDOW_MS)) recent.delete(key);
    }
  }
  return false;
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }

    const parsed = enquiryInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Please check the highlighted fields and try again.',
        400,
      );
    }

    // Honeypot: reply as if it worked, record nothing. A bot told it failed
    // will retry with variations; one told it succeeded moves on.
    if (parsed.data.website) {
      return successResponse({ received: true }, 201);
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(ip)) {
      throw new AppError(
        'RATE_LIMITED',
        'Too many enquiries from this connection — please try again later or WhatsApp us.',
        429,
      );
    }

    const cookieStore = await cookies();
    const attribution = parseAttributionCookie(
      cookieStore.get(ATTRIBUTION_COOKIE)?.value,
    );
    await leadsService.createEnquiryLead(parsed.data, attribution);
    // The lead id is internal — the visitor only needs to know we heard them.
    return successResponse({ received: true }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
