import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import * as partnersService from '@/modules/partners/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

// GET /api/tutor-portal/qr-code?code=XYZ&batchId=... — a tutor's own QR for
// one of their own codes (2026-08-02 follow-up, mirrors
// /api/partner-portal/qr-code exactly). Ownership is checked against
// getReferralSummaryForSession's own code list, which also auto-provisions
// the tutor's partner record + code on first use.
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const summary = await tutorsService.getReferralSummaryForSession(sessionId);
    if (!summary) {
      throw new AppError('NOT_FOUND', 'You are not set up as a referral partner yet.', 404);
    }

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code || !summary.codes.some((c) => c.code === code.toUpperCase())) {
      throw new AppError('NOT_FOUND', 'That code does not belong to you.', 404);
    }

    const batchId = url.searchParams.get('batchId') ?? undefined;
    const dataUrl = await partnersService.generateReferralQrDataUrl(code, batchId);
    return successResponse({ dataUrl });
  } catch (err) {
    return handleRouteError(err);
  }
}
