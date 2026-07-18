import { createSupabaseServerClient } from '@/lib/supabase/server';

// GET /api/health — pinged by Uptime Robot every 5 minutes. The query keeps
// the Supabase free-tier project from pausing after 7 idle days (RISK-P03,
// Document 7, Section 3.3). An unauthenticated request returns zero rows via
// RLS, which is fine — the database request itself resets the idle timer.
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('courses').select('id').limit(1);
    return Response.json({ status: error ? 'error' : 'ok' });
  } catch {
    return Response.json({ status: 'error' }, { status: 500 });
  }
}
