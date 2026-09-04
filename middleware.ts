import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { ROLE_ROUTES, isStaffRole } from '@/lib/auth/roles';
import type { Database } from '@/lib/supabase/database.types';

// Two jobs, in this order:
//
// 1. Trailing-slash canonicalisation (domain consolidation, Coding Docs/20).
//    next.config.ts sets `skipTrailingSlashRedirect: true` because Next's own
//    trailing-slash redirect ran BEFORE the WordPress redirect map, which
//    turned every legacy URL (they all end in "/") into a two-hop chain
//    (/x/ → /x → destination). With it off, the map matches /x/ directly in
//    one hop — and this middleware restores the old behaviour for everything
//    else, so /programmes/ still 308s to /programmes and the site keeps one
//    canonical URL per page. Redirects from next.config.ts run before
//    middleware, so a legacy URL never reaches this code.
//
// 2. Staff route protection (Document 6, Section 3), unchanged, and still
//    applied only to the staff prefixes below.
//
// ⚠️ The staff check is a UX convenience layer, not the security boundary —
// RLS at the database layer is the actual enforcement (BR-11, Document 4).

const STAFF_PREFIXES = [
  '/dashboard',
  '/registrations',
  '/payments',
  '/courses',
  '/users',
  '/tutors',
  '/attendance',
  '/course-feedback',
  '/calls',
  '/certificates',
  '/messaging',
  '/assistant',
  '/follow-up',
  '/corporate',
  '/editorial',
  '/coupons',
  '/sequences',
];

export function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** `/programmes/` → `/programmes`; `/` and slash-less paths are left alone. */
export function trailingSlashRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname.length <= 1 || !pathname.endsWith('/')) return null;
  // A plain URL, not nextUrl.clone(): NextURL re-applies Next's own
  // trailing-slash normalisation when its pathname is set, which handed the
  // slash straight back and produced a redirect to itself (caught 2026-09-04).
  const url = new URL(request.url);
  url.pathname = pathname.replace(/\/+$/, '');
  return NextResponse.redirect(url, 308);
}

export async function middleware(request: NextRequest) {
  const canonical = trailingSlashRedirect(request);
  if (canonical) return canonical;

  if (!isStaffPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser() also silently refreshes an expired access token via the
  // httpOnly refresh cookie (Document 6, Section 2).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: staffUser } = await supabase
    .from('staff_users')
    .select('role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  // No staff_users row at all is a different problem from a deactivated
  // account, and needs a different remedy. It usually means this Auth
  // identity was never granted staff access — most often a Google sign-in
  // that created a second Auth user instead of linking to the invited one
  // (manual linking is disabled, supabase/config.toml). Reporting that as
  // "inactive" sends the person to an administrator who can see a perfectly
  // active row for them and has nothing to fix.
  if (!staffUser) {
    return NextResponse.redirect(new URL('/login?error=no-account', request.url));
  }

  if (!staffUser.is_active || !isStaffRole(staffUser.role)) {
    return NextResponse.redirect(new URL('/login?error=inactive', request.url));
  }

  const path = request.nextUrl.pathname;
  const requiredRoles = Object.entries(ROLE_ROUTES).find(([route]) =>
    path.startsWith(route),
  )?.[1];

  if (requiredRoles && !requiredRoles.includes(staffUser.role)) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return response;
}

export const config = {
  // Every page request, so the trailing-slash rule is universal. Excluded:
  // API routes (webhooks and machine callers must never be bounced), Next's
  // own assets, and anything with a file extension (public/ files).
  matcher: ['/((?!api/|_next/static|_next/image|.*\\..*).*)'],
};
