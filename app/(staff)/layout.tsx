import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { NAV_ITEMS_BY_ROLE } from '@/lib/auth/roles';
import * as usersService from '@/modules/users/service';
import { LogoutButton } from '@/components/LogoutButton';

// Role-aware navigation shell (Document 8, Section 9): a role never sees a
// link to a screen it cannot access — the link itself is absent.
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const staffUser = await usersService.getCurrentStaffUser();
  if (!staffUser) {
    redirect('/login');
  }

  const navItems = NAV_ITEMS_BY_ROLE[staffUser.role];

  return (
    <div className="flex min-h-screen">
      <aside className="print-hidden w-56 shrink-0 border-r bg-card px-4 py-6">
        <p className="mb-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Course System
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print-hidden flex h-14 items-center justify-end border-b bg-card px-6">
          <LogoutButton staffName={`${staffUser.fullName} (${staffUser.role})`} />
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
