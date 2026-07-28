'use client';

// Staff console navigation (UX review, 2026-07-28). Two fixes to the
// previous plain <aside><nav> in app/(staff)/layout.tsx:
//   1. Grouped into scannable sections instead of one flat list (up to 17
//      items for admin) — see lib/auth/roles.ts's NAV_ITEMS_BY_ROLE.
//   2. Marks the current page with aria-current + a visible highlight,
//      matching the pattern already correct in the student portal's own
//      nav (app/(public)/portal/page.tsx).
// Also owns the responsive fallback this console never had: a desktop
// sidebar (>=768px) and a mobile topbar+dropdown below that, mirroring
// portal-design-system.tsx's rail->topbar breakpoint but in Tailwind
// utilities to match this console's existing styling approach.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  section: string;
}

function groupBySection(items: NavItem[]): Array<{ section: string; items: NavItem[] }> {
  const groups: Array<{ section: string; items: NavItem[] }> = [];
  for (const item of items) {
    const existing = groups.find((g) => g.section === item.section);
    if (existing) existing.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

function NavLinks({ groups, pathname, onNavigate }: {
  groups: Array<{ section: string; items: NavItem[] }>;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.section}>
          <p className="mb-1 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {group.section}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={onNavigate}
                  className={
                    isCurrent
                      ? 'block rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground'
                      : 'block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StaffNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const groups = groupBySection(items);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="print-hidden hidden w-56 shrink-0 border-r bg-card px-4 py-6 md:block">
        <p className="mb-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Course System
        </p>
        <nav aria-label="Staff navigation">
          <NavLinks groups={groups} pathname={pathname} />
        </nav>
      </aside>

      {/* Mobile topbar + dropdown */}
      <div className="print-hidden border-b bg-card md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Course System
          </p>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="staff-mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-md border"
          >
            <span className="sr-only">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? (
                <path d="M5 5l14 14M19 5L5 19" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
        {mobileOpen && (
          <nav id="staff-mobile-nav" aria-label="Staff navigation" className="max-h-[70vh] overflow-y-auto border-t px-4 py-4">
            <NavLinks groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </nav>
        )}
      </div>
    </>
  );
}
