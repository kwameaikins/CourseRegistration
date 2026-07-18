import { redirect } from 'next/navigation';

import { DEFAULT_ROUTE_BY_ROLE } from '@/lib/auth/roles';
import * as usersService from '@/modules/users/service';

// Root: staff land on their role's default page (Document 8, Section 9).
export default async function RootPage() {
  const staffUser = await usersService.getCurrentStaffUser();
  if (!staffUser) {
    redirect('/login');
  }
  redirect(DEFAULT_ROUTE_BY_ROLE[staffUser.role]);
}
