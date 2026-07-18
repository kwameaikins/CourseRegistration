import type { StaffRole } from '@/lib/domain/types';

export const STAFF_ROLES: readonly StaffRole[] = [
  'admin',
  'finance',
  'marketing',
  'tutor',
  'management',
] as const;

// Route protection table (Document 6, Section 3). The middleware is a UX
// convenience layer — RLS is the actual security boundary.
export const ROLE_ROUTES: Record<string, StaffRole[]> = {
  '/dashboard': ['admin', 'management'],
  '/registrations': ['admin', 'finance', 'marketing'],
  '/payments': ['admin', 'finance'],
  '/courses': ['admin'],
  '/users': ['admin'],
  '/my-courses': ['tutor'],
  '/follow-up': ['admin', 'marketing'], // Phase 2
};

// Default landing page per role (Document 8: Finance lands on Payments,
// Tutor on My Courses, Admin/Management on Dashboard).
export const DEFAULT_ROUTE_BY_ROLE: Record<StaffRole, string> = {
  admin: '/dashboard',
  management: '/dashboard',
  finance: '/payments',
  marketing: '/registrations',
  tutor: '/my-courses',
};

// Sidebar navigation per role (Document 8, Section 9) — a role never sees a
// link to a screen it cannot access.
export const NAV_ITEMS_BY_ROLE: Record<StaffRole, { href: string; label: string }[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/registrations', label: 'Registrations' },
    { href: '/payments', label: 'Payments' },
    { href: '/courses', label: 'Courses' },
    { href: '/users', label: 'Users' },
  ],
  finance: [
    { href: '/payments', label: 'Payments' },
    { href: '/registrations', label: 'Registrations' },
  ],
  marketing: [{ href: '/registrations', label: 'Registrations' }],
  tutor: [{ href: '/my-courses', label: 'My Courses' }],
  management: [{ href: '/dashboard', label: 'Dashboard' }],
};

export function isStaffRole(value: string | null | undefined): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as string[]).includes(value);
}
