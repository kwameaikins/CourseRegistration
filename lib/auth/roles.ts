import type { StaffRole } from '@/lib/domain/types';

export const STAFF_ROLES: readonly StaffRole[] = [
  'admin',
  'finance',
  'marketing',
  'management',
] as const;

// Route protection table (Document 6, Section 3). The middleware is a UX
// convenience layer — RLS is the actual security boundary.
export const ROLE_ROUTES: Record<string, StaffRole[]> = {
  '/dashboard': ['admin', 'management'],
  // More specific than '/registrations' below — must come first: the
  // middleware's route match is a `find()` over startsWith, so the first
  // matching entry wins and a shorter prefix declared earlier would shadow
  // this one for every /registrations/import request.
  '/registrations/import': ['admin', 'finance', 'marketing', 'management'],
  '/registrations': ['admin', 'finance', 'marketing'],
  '/leads': ['admin', 'marketing', 'management'],
  '/sales': ['admin', 'marketing', 'management'],
  '/campaigns': ['admin', 'marketing', 'management'],
  '/payments': ['admin', 'finance'],
  '/courses': ['admin'],
  '/users': ['admin'],
  // Tutors are external parties, not staff (founder-approved 2026-07-27) —
  // they use /tutor-portal (PIN + session, no staff role) instead. This
  // screen is where staff manage tutor records themselves.
  '/tutors': ['admin', 'management'],
  '/attendance': ['admin', 'management'],
  '/live-sessions': ['admin', 'management'],
  '/course-feedback': ['admin', 'management'],
  '/calls': ['admin', 'finance', 'management'],
  '/certificates': ['admin'],
  '/messaging': ['admin'],
  '/assistant': ['admin'],
  '/corporate': ['admin', 'finance', 'marketing', 'management'],
  '/follow-up': ['admin', 'marketing'], // Phase 2
  // Knowsia Growth Partner Programme (2026-08-02) — applications/partners/
  // codes are admin+marketing (same as leads/campaigns); commissions/
  // payouts are finance+admin (same as payments). All 4 sections live on
  // one page, so the route itself is open to the union of both.
  '/partners': ['admin', 'marketing', 'finance'],
  // Knowsia Insights (2026-08-02) — the Editorial Dashboard (source
  // registry, pipeline queues, Level 2 review) is admin+marketing, same
  // roles as leads/campaigns/partners (the closest existing precedent to an
  // editorial function).
  '/editorial': ['admin', 'marketing'],
};

// Default landing page per role (Document 8: Finance lands on Payments,
// Admin/Management on Dashboard).
export const DEFAULT_ROUTE_BY_ROLE: Record<StaffRole, string> = {
  admin: '/dashboard',
  management: '/dashboard',
  finance: '/payments',
  marketing: '/registrations',
};

// Sidebar navigation per role (Document 8, Section 9) — a role never sees a
// link to a screen it cannot access. `section` groups the sidebar into
// scannable clusters (UX review, 2026-07-28 — a flat 17-item list for admin
// had no visual hierarchy); it's presentation-only and doesn't affect
// role-gating (see ROLE_ROUTES above for the actual security boundary).
export const NAV_ITEMS_BY_ROLE: Record<
  StaffRole,
  { href: string; label: string; section: string }[]
> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', section: 'Overview' },
    { href: '/registrations', label: 'Registrations', section: 'Sales & Leads' },
    { href: '/registrations/import', label: 'Import Registrations', section: 'Sales & Leads' },
    { href: '/sales', label: 'Sales Pipeline', section: 'Sales & Leads' },
    { href: '/leads/assignment-rules', label: 'Lead Routing Rules', section: 'Sales & Leads' },
    { href: '/campaigns', label: 'Campaigns', section: 'Sales & Leads' },
    { href: '/corporate', label: 'Corporate', section: 'Sales & Leads' },
    { href: '/partners', label: 'Partners & Coupons', section: 'Sales & Leads' },
    { href: '/editorial', label: 'Knowsia Insights', section: 'Communication' },
    { href: '/payments', label: 'Payments', section: 'Finance' },
    { href: '/courses', label: 'Courses', section: 'Operations' },
    { href: '/tutors', label: 'Tutors', section: 'Operations' },
    { href: '/attendance', label: 'Attendance', section: 'Operations' },
    { href: '/live-sessions', label: 'Live Sessions', section: 'Operations' },
    { href: '/course-feedback', label: 'Feedback', section: 'Operations' },
    { href: '/certificates', label: 'Certificates', section: 'Operations' },
    { href: '/calls', label: 'Calls', section: 'Communication' },
    { href: '/messaging', label: 'Messaging', section: 'Communication' },
    { href: '/assistant', label: 'Assistant', section: 'Communication' },
    { href: '/users', label: 'Users', section: 'System' },
  ],
  finance: [
    { href: '/payments', label: 'Payments', section: 'Finance' },
    { href: '/partners', label: 'Partners & Coupons', section: 'Finance' },
    { href: '/registrations', label: 'Registrations', section: 'Sales & Leads' },
    { href: '/registrations/import', label: 'Import Registrations', section: 'Sales & Leads' },
    { href: '/corporate', label: 'Corporate', section: 'Sales & Leads' },
    { href: '/calls', label: 'Calls', section: 'Communication' },
  ],
  marketing: [
    { href: '/registrations', label: 'Registrations', section: 'Sales & Leads' },
    { href: '/leads', label: 'Leads', section: 'Sales & Leads' },
    { href: '/sales', label: 'Sales Pipeline', section: 'Sales & Leads' },
    { href: '/campaigns', label: 'Campaigns', section: 'Sales & Leads' },
    { href: '/partners', label: 'Partners & Coupons', section: 'Sales & Leads' },
    { href: '/registrations/import', label: 'Import Registrations', section: 'Sales & Leads' },
    { href: '/corporate', label: 'Corporate', section: 'Sales & Leads' },
    { href: '/editorial', label: 'Knowsia Insights', section: 'Sales & Leads' },
  ],
  management: [
    { href: '/dashboard', label: 'Dashboard', section: 'Overview' },
    { href: '/leads', label: 'Leads', section: 'Sales & Leads' },
    { href: '/sales', label: 'Sales Pipeline', section: 'Sales & Leads' },
    { href: '/campaigns', label: 'Campaigns', section: 'Sales & Leads' },
    { href: '/registrations/import', label: 'Import Registrations', section: 'Sales & Leads' },
    { href: '/corporate', label: 'Corporate', section: 'Sales & Leads' },
    { href: '/tutors', label: 'Tutors', section: 'Operations' },
    { href: '/attendance', label: 'Attendance', section: 'Operations' },
    { href: '/live-sessions', label: 'Live Sessions', section: 'Operations' },
    { href: '/course-feedback', label: 'Feedback', section: 'Operations' },
    { href: '/calls', label: 'Calls', section: 'Communication' },
  ],
};

export function isStaffRole(value: string | null | undefined): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as string[]).includes(value);
}
