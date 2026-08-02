import { NextResponse } from 'next/server';
import * as partnersService from '@/modules/partners/service';
import { REFERRAL_CODE_COOKIE, REFERRAL_COOKIE_MAX_AGE_SECONDS } from '@/modules/partners/types';

// Tracked referral link (Knowsia Growth Partner Programme, 2026-08-02):
// logs the click, sets a 30-day attribution cookie, and forwards to the
// public registration form pre-filled with the code. An explicit code typed
// at registration still wins over this cookie (see
// modules/registrations/service.ts's createRegistration).
//
// Course-specific links (2026-08-02 follow-up): an optional `batchId` on
// this incoming URL is forwarded straight through to /register, which
// already pre-selects that batch on mount (built for the waitlist "a seat
// opened up" email — see RegistrationForm.tsx). No validation here — an
// unknown/expired/deactivated batch id just fails RegistrationForm's own
// `batchOptions.some(...)` check and falls back to "Select a course"
// exactly like today, so a bad id degrades gracefully with zero extra code.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Best-effort — a logging hiccup must never break the redirect itself.
  try {
    await partnersService.recordLinkClickSystem(code);
  } catch (err) {
    console.error('[partner link click]', err);
  }

  const incomingUrl = new URL(request.url);
  const batchId = incomingUrl.searchParams.get('batchId');

  const redirectUrl = new URL('/register', request.url);
  redirectUrl.searchParams.set('ref', code);
  if (batchId) redirectUrl.searchParams.set('batchId', batchId);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(REFERRAL_CODE_COOKIE, code.toUpperCase(), {
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
  return response;
}
