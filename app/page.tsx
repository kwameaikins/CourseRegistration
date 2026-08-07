import { redirect } from 'next/navigation';

import { DEFAULT_ROUTE_BY_ROLE } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import * as usersService from '@/modules/users/service';

// Root: staff land on their role's default page (Document 8, Section 9).
export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const staffUser = await usersService.getCurrentStaffUser();
  if (!staffUser) {
    // This is the landing point straight after a successful sign-in, so it is
    // where a staff member with no staff_users row actually ends up — tell
    // them that rather than claiming their account is deactivated.
    const status = await usersService.getStaffAccountStatus();
    redirect(`/login?error=${status === 'no-account' ? 'no-account' : 'inactive'}`);
  }
  redirect(DEFAULT_ROUTE_BY_ROLE[staffUser.role]);
}
