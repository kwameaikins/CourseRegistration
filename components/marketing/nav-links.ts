// The site's destinations, in one place.
//
// This app has TWO public page shells and no shared (public) layout: the
// marketing pages use the `.mk` design system with MarketingNav, while /news,
// /verify, /register and the portal login pages use KnowsiaHeader with
// Tailwind. That split is why a menu added to one of them vanished when a
// visitor clicked through to the other (founder report, 2026-09-07).
//
// Two renderings is acceptable — two different design systems genuinely need
// different markup. Two LISTS is not: that is how a menu ends up offering
// different destinations depending on which page you happen to be standing on.
// Both shells import this.

export type NavLink = {
  href: string;
  label: string;
  // The study platform is a separate application, served at /learn on this
  // host by a rewrite. Next's client router must not try to own those routes,
  // so they render as plain anchors and do a real navigation.
  external?: boolean;
};

export const MARKETING_NAV_LINKS: NavLink[] = [
  // The logo links home too, but a wordmark is a convention rather than a
  // signpost — people look for the word (founder report, 2026-09-07).
  { href: '/', label: 'Home' },
  { href: '/learn/catalogue', label: 'Courses', external: true },
  { href: '/learn/questions', label: 'Question bank', external: true },
  { href: '/programmes', label: 'Programmes' },
  { href: '/news', label: 'Insights' },
  { href: '/updates', label: 'Updates' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

// /portal is the REGISTRATION portal (programme participants), which is not
// the same login as the study platform at /learn. Two portals, two logins —
// left as it was rather than quietly repointed. Worth resolving, but that is a
// product decision, not a navigation fix.
export const STUDENT_LOGIN_HREF = '/portal/login';
