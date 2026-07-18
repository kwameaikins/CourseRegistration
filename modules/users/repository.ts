// Data access only — business rules live in service.ts (Document 11, Section 3).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type StaffUserRow = Database['public']['Tables']['staff_users']['Row'];

// Reads the requesting user's own staff_users row via the session client
// (permitted by the self_read_staff_users RLS policy for every role).
export async function selectCurrentStaffUser(): Promise<StaffUserRow | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('staff_users')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectStaffUsers(): Promise<StaffUserRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('staff_users')
    .select('*')
    .order('full_name');
  if (error) throw error;
  return data;
}

// Creating a staff account is a two-step orchestration: Supabase Auth user
// (invitation email) + staff_users row (Document 5, Section 11). The Auth
// admin API requires the service-role key; the calling service verifies the
// session role is admin before this runs.
export async function insertStaffUserWithAuthAccount(input: {
  email: string;
  full_name: string;
  role: StaffUserRow['role'];
}): Promise<StaffUserRow> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: invited, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(input.email);
  if (inviteError) throw inviteError;

  const { data, error } = await supabase
    .from('staff_users')
    .insert({
      user_id: invited.user.id,
      email: input.email,
      full_name: input.full_name,
      role: input.role,
    })
    .select()
    .single();

  if (error) {
    // Best-effort rollback so a failed row insert does not leave an orphaned
    // Auth account that would block re-inviting the same email.
    await supabase.auth.admin.deleteUser(invited.user.id).catch(() => undefined);
    throw error;
  }
  return data;
}

export async function updateStaffUserById(
  staffUserId: string,
  changes: Database['public']['Tables']['staff_users']['Update'],
): Promise<StaffUserRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('staff_users')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', staffUserId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
