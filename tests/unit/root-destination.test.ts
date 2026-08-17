import { describe, expect, it } from 'vitest';

import { getRootDestination } from '@/lib/auth/root-destination';

// Where the root of reg.knowsia.com sends people. The anonymous branch changed
// on 2026-08-17; every authenticated branch must not have.

describe('getRootDestination — anonymous visitors', () => {
  // The bug this fixes: a student who typed the bare domain, or trimmed a
  // /verify URL off a printed certificate, was redirected to the STAFF sign-in
  // and left with no way forward.
  it('shows the public landing instead of the staff sign-in', () => {
    expect(
      getRootDestination({
        isAuthenticated: false,
        staffRole: null,
        accountStatus: 'no-account',
      }),
    ).toEqual({ kind: 'public-landing' });
  });

  it('never sends an anonymous visitor to /login, whatever the account status', () => {
    for (const accountStatus of ['active', 'inactive', 'no-account'] as const) {
      const destination = getRootDestination({
        isAuthenticated: false,
        staffRole: null,
        accountStatus,
      });
      expect(destination.kind).toBe('public-landing');
    }
  });
});

describe('getRootDestination — staff (unchanged behaviour)', () => {
  it('sends each role to its own default screen', () => {
    expect(
      getRootDestination({ isAuthenticated: true, staffRole: 'admin', accountStatus: 'active' }),
    ).toEqual({ kind: 'redirect', to: '/dashboard' });

    expect(
      getRootDestination({ isAuthenticated: true, staffRole: 'finance', accountStatus: 'active' }),
    ).toEqual({ kind: 'redirect', to: '/payments' });

    expect(
      getRootDestination({ isAuthenticated: true, staffRole: 'marketing', accountStatus: 'active' }),
    ).toEqual({ kind: 'redirect', to: '/registrations' });

    expect(
      getRootDestination({
        isAuthenticated: true,
        staffRole: 'management',
        accountStatus: 'active',
      }),
    ).toEqual({ kind: 'redirect', to: '/dashboard' });
  });

  // Two different failures that used to read identically to the user.
  it('distinguishes an account that does not exist from one that is deactivated', () => {
    expect(
      getRootDestination({
        isAuthenticated: true,
        staffRole: null,
        accountStatus: 'no-account',
      }),
    ).toEqual({ kind: 'redirect', to: '/login?error=no-account' });

    expect(
      getRootDestination({
        isAuthenticated: true,
        staffRole: null,
        accountStatus: 'inactive',
      }),
    ).toEqual({ kind: 'redirect', to: '/login?error=inactive' });
  });
});
