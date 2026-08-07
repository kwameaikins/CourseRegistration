import { NextResponse } from 'next/server';

import { getPostAuthRedirect, parseEmailOtpType } from '@/lib/auth/callback';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Lands both Google OAuth and every Supabase Auth email link (invite,
// password recovery, magic link). Supabase sends one of two token shapes
// depending on the project's flow and email templates, so both are handled:
//   ?code=...                  PKCE      -> exchangeCodeForSession
//   ?token_hash=...&type=...   email OTP -> verifyOtp
// Handling only `code` meant invite links fell through to an "oauth failed"
// message and staff could never activate their accounts.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = parseEmailOtpType(searchParams.get('type'));
  const next = searchParams.get('next');

  // An email link that fails is almost always expired or already used, which
  // is a different remedy from a failed Google sign-in — tell them apart.
  const failure = type || tokenHash ? 'link' : 'oauth';

  if (code || (tokenHash && type)) {
    const supabase = await createSupabaseServerClient();

    const { error } =
      tokenHash && type
        ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
        : await supabase.auth.exchangeCodeForSession(code!);

    if (!error) {
      const destination = getPostAuthRedirect(type, next);
      const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
      if (process.env.NODE_ENV !== 'development' && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${destination}`);
      }
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=${failure}`);
}
