// Data access only — business rules live in service.ts (Document 11, Section 3).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type StaffUserRow = Database['public']['Tables']['staff_users']['Row'];

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

// Where Supabase Auth sends someone after they click an invitation or
// password-reset link. Passing this explicitly matters: without it Supabase
// falls back to the project's Site URL, which is how staff invitations came
// to point at 127.0.0.1 and left invited accounts with no way to sign in.
// The callback recognises the invite/recovery type and forwards to
// /auth/set-password on its own; `next` is belt and braces.
function authRedirectUrl(): string {
  return `${APP_URL()}/auth/callback?next=%2Fauth%2Fset-password`;
}

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

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    input.email,
    { redirectTo: authRedirectUrl() },
  );
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

export async function selectStaffUserById(staffUserId: string): Promise<StaffUserRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('staff_users')
    .select('*')
    .eq('id', staffUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Re-issues a password-setup link for a staff account that already exists.
//
// Uses 'recovery' rather than 'invite': the Auth user was created when the
// account was added, and Supabase rejects a second invite for an existing
// address. Recovery also covers both cases an admin actually faces — an
// invitation that never arrived, and a staff member who has forgotten their
// password — with one action.
//
// generateLink only mints the URL, it sends nothing. The email goes out via
// Resend, the app's own provider, rather than Supabase's built-in SMTP, which
// is rate limited to a couple of messages per hour by default.
export async function generateStaffPasswordSetupLink(email: string): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: authRedirectUrl() },
  });
  if (error) throw error;

  const link = data.properties?.action_link;
  if (!link) {
    throw new Error('Supabase returned no action link for the password reset.');
  }
  return link;
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
