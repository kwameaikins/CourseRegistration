import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { PARTNER_SESSION_COOKIE } from '@/modules/partners/types';

// GET /api/partner-portal/qr-code?code=XYZ&batchId=... — the partner's own
// QR for one of their own codes (ownership is checked against their
// dashboard's code list, not just any code in the system). batchId is
// optional (2026-08-02 follow-up) — makes the QR land the scanner on
// /register with that course pre-selected.
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
    const dashboard = await partnersService.getPartnerPortalDashboard(sessionId);

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code || !dashboard.codes.some((c) => c.code === code.toUpperCase())) {
      throw new AppError('NOT_FOUND', 'That code does not belong to you.', 404);
    }

    const batchId = url.searchParams.get('batchId') ?? undefined;
    const dataUrl = await partnersService.generateReferralQrDataUrl(code, batchId);
    return successResponse({ dataUrl });
  } catch (err) {
    return handleRouteError(err);
  }
}
