import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';

// Service-role client — BYPASSES RLS ENTIRELY (Document 7, Section 3.1).
//
// Permitted call sites only:
//   1. modules/communications/repository.ts (email_log writes)
//   2. /api/cron/reminders (authenticated by CRON_SECRET)
//   3. /api/webhooks/paystack (authenticated by Paystack signature, BR-13)
//   4. The public registration orchestration in modules/registrations
//      (Document 5, Section 2) — the anon role has no RLS SELECT policies on
//      participants/registrations/payments (by design, to keep PII unreadable
//      via the public anon key), so the server-side route performs the
//      validated insert-and-return orchestration with this client instead.
//   5. modules/users (staff account creation requires the Auth admin API).
//
// Never import this file from any client component or any code path that has
// not already performed its own authorization check.
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
