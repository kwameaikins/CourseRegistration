// Data access only — rules live in service.ts.
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export async function selectOptOut(email: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('marketing_opt_outs')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function selectOptOutSet(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('marketing_opt_outs')
    .select('email')
    .in('email', emails);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.email));
}

export async function upsertOptOut(input: {
  email: string;
  source: 'link' | 'staff' | 'bounce';
  reason?: string | null;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('marketing_opt_outs')
    .upsert(
      { email: input.email, source: input.source, reason: input.reason ?? null },
      { onConflict: 'email', ignoreDuplicates: true },
    );
  if (error) throw error;
}
