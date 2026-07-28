import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { NAV_ITEMS_BY_ROLE } from '@/lib/auth/roles';
import * as usersService from '@/modules/users/service';
import { LogoutButton } from '@/components/LogoutButton';
import { StaffNav } from '@/components/StaffNav';
import { SkipLink } from '@/components/SkipLink';

// Role-aware navigation shell (Document 8, Section 9): a role never sees a
// link to a screen it cannot access — the link itself is absent.
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const staffUser = await usersService.getCurrentStaffUser();
  if (!staffUser) {
    redirect('/login');
  }

  const navItems = NAV_ITEMS_BY_ROLE[staffUser.role];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SkipLink targetId="staff-main" />
      <StaffNav items={navItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print-hidden flex h-14 items-center justify-end border-b bg-card px-6">
          <LogoutButton staffName={`${staffUser.fullName} (${staffUser.role})`} />
        </header>
        <main id="staff-main" className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
