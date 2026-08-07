import { describe, expect, it } from 'vitest';

import {
  SET_PASSWORD_ROUTE,
  getPostAuthRedirect,
  parseEmailOtpType,
} from '@/lib/auth/callback';

describe('parseEmailOtpType', () => {
  it('accepts the types Supabase puts on its email links', () => {
    expect(parseEmailOtpType('invite')).toBe('invite');
    expect(parseEmailOtpType('recovery')).toBe('recovery');
    expect(parseEmailOtpType('magiclink')).toBe('magiclink');
  });

  it('rejects anything else so a crafted ?type= cannot reach verifyOtp', () => {
    expect(parseEmailOtpType(null)).toBeNull();
    expect(parseEmailOtpType('')).toBeNull();
    expect(parseEmailOtpType('admin')).toBeNull();
    expect(parseEmailOtpType('INVITE')).toBeNull();
  });
});

describe('getPostAuthRedirect', () => {
  // The whole point of the flow: an invited user has no password yet, and a
  // recovery user cannot use theirs. Landing either on '/' signs them in once
  // and strands them at the next login.
  it('forces invite and recovery to the set-password screen', () => {
    expect(getPostAuthRedirect('invite', null)).toBe(SET_PASSWORD_ROUTE);
    expect(getPostAuthRedirect('recovery', null)).toBe(SET_PASSWORD_ROUTE);
  });

  it('ignores next for invite and recovery rather than skipping the password step', () => {
    expect(getPostAuthRedirect('invite', '/dashboard')).toBe(SET_PASSWORD_ROUTE);
    expect(getPostAuthRedirect('recovery', '/payments')).toBe(SET_PASSWORD_ROUTE);
  });

  it('honours next for ordinary sign-ins', () => {
    expect(getPostAuthRedirect(null, '/dashboard')).toBe('/dashboard');
    expect(getPostAuthRedirect('magiclink', '/payments')).toBe('/payments');
    expect(getPostAuthRedirect(null, null)).toBe('/');
  });

  it('still rejects open redirects on the paths that honour next', () => {
    expect(getPostAuthRedirect(null, 'https://attacker.example')).toBe('/');
    expect(getPostAuthRedirect('magiclink', '//attacker.example')).toBe('/');
    expect(getPostAuthRedirect(null, '/\\attacker.example')).toBe('/');
  });
});
