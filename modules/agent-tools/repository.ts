// Data access only — the audit trail for write-confirm tool executions.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';

export async function insertStaffActionAuditLog(input: {
  actor_staff_id: string;
  action_type: string;
  target_registration_id: string | null;
  reason?: string | null;
  details: Json;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('staff_action_audit_log').insert(input);
  if (error) throw error;
}
