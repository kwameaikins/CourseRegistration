import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { ROLE_ROUTES, isStaffRole } from '@/lib/auth/roles';
import type { Database } from '@/lib/supabase/database.types';

// Route protection (Document 6, Section 3).
//
// ⚠️ This middleware is a UX convenience layer, not the security boundary —
// RLS at the database layer is the actual enforcement (BR-11, Document 4).
export async function middleware(request: NextRequest) {
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
    .single();

  if (!staffUser?.is_active || !isStaffRole(staffUser.role)) {
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
  matcher: [
    '/dashboard/:path*',
    '/registrations/:path*',
    '/payments/:path*',
    '/courses/:path*',
    '/users/:path*',
    '/my-courses/:path*',
    '/follow-up/:path*',
  ],
};
