import { DEFAULT_ROUTE_BY_ROLE } from '@/lib/auth/roles';
import type { StaffRole } from '@/lib/domain/types';

// Where the root of reg.knowsia.com sends a visitor.
//
// Extracted as a pure function for the same reason getPostAuthRedirect was
// (lib/auth/callback.ts): the decision is the part worth testing, and it cannot
// be tested inside a server component that also talks to Supabase. The page
// stays a thin shell around this.
//
// The rule that changed on 2026-08-17 is the anonymous branch. It used to
// redirect to '/login' — the STAFF sign-in — so a student who typed the bare
// domain, or trimmed a '/verify' URL off a printed certificate, hit an internal
// screen with no way forward. Anonymous visitors now get the public signpost.
// Every authenticated branch is unchanged.

export type RootDestination =
  | { kind: 'public-landing' }
  | { kind: 'redirect'; to: string };

export function getRootDestination(input: {
  isAuthenticated: boolean;
  // Null when the session has no staff_users row at all, or the row is
  // inactive — `accountStatus` distinguishes the two for the error message.
  staffRole: StaffRole | null;
  accountStatus: 'active' | 'inactive' | 'no-account';
}): RootDestination {
  if (!input.isAuthenticated) {
    return { kind: 'public-landing' };
  }

  if (!input.staffRole) {
    // This is the landing point straight after a successful sign-in, so it is
    // where someone authenticated with no usable staff row actually ends up.
    // Say which of the two it is rather than always claiming "deactivated".
    const error = input.accountStatus === 'no-account' ? 'no-account' : 'inactive';
    return { kind: 'redirect', to: `/login?error=${error}` };
  }

  return { kind: 'redirect', to: DEFAULT_ROUTE_BY_ROLE[input.staffRole] };
}
