import { NextResponse } from 'next/server';
import * as partnersService from '@/modules/partners/service';
import { REFERRAL_CODE_COOKIE, REFERRAL_COOKIE_MAX_AGE_SECONDS } from '@/modules/partners/types';

// Tracked referral link (Knowsia Growth Partner Programme, 2026-08-02):
// logs the click, sets a 30-day attribution cookie, and forwards to the
// public registration form pre-filled with the code. An explicit code typed
// at registration still wins over this cookie (see
// modules/registrations/service.ts's createRegistration).
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Best-effort — a logging hiccup must never break the redirect itself.
  try {
    await partnersService.recordLinkClickSystem(code);
  } catch (err) {
    console.error('[partner link click]', err);
  }

  const response = NextResponse.redirect(
    new URL(`/register?ref=${encodeURIComponent(code)}`, request.url),
  );
  response.cookies.set(REFERRAL_CODE_COOKIE, code.toUpperCase(), {
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
  return response;
}
