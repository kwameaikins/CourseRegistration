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
    redirect('/login?error=inactive');
  }
  redirect(DEFAULT_ROUTE_BY_ROLE[staffUser.role]);
}
