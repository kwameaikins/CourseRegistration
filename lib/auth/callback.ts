// Decides where an authenticated caller lands after /auth/callback.
//
// Kept free of Supabase and Next imports so the routing rules are unit
// testable the same way getSafeOAuthNext is (lib/auth/oauth.ts).
import { getSafeOAuthNext } from '@/lib/auth/oauth';

// The `type` values Supabase puts on the links in its email templates.
// 'invite' and 'recovery' are the two that matter to staff: both land a user
// in a session that has no usable password behind it.
const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const;

export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export const SET_PASSWORD_ROUTE = '/auth/set-password';

export function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value ?? '')
    ? (value as EmailOtpType)
    : null;
}

// An invited staff member has an Auth account with no password, and a
// recovery link means they cannot remember the one they have. Both must set a
// password before the session is worth anything — otherwise they are signed
// in once and locked out forever after (the bug this flow exists to fix).
// Every other type keeps the caller-supplied `next`, sanitised.
export function getPostAuthRedirect(
  type: EmailOtpType | null,
  next: string | null,
): string {
  if (type === 'invite' || type === 'recovery') {
    return SET_PASSWORD_ROUTE;
  }
  return getSafeOAuthNext(next);
}
