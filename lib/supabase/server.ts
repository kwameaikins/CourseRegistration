import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '@/lib/supabase/database.types';

// Session-aware server client: anon key + the requesting user's session cookie.
// RLS applies exactly as it would for that user (Document 7, Section 3.1).
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies — session refresh is
            // handled by middleware.ts, so this is safe to ignore.
          }
        },
      },
    },
  );
}
