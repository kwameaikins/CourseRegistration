'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// The site menu (founder correction, 2026-09-07).
//
// Every marketing page used to carry its own `hero-nav` holding the logo and
// exactly ONE link, so a visitor could not reach the courses, the programmes or
// the insights without scrolling the page and hunting for an in-section button.
// Knowsia Insights had been publishing since August with nothing anywhere
// linking to it.
//
// This is a MENU, not a row of links in the hero: it sits above the hero, stays
// with you as you scroll, and collapses to a button on a phone rather than
// stacking seven links on top of the headline. One list in one file, for the
// same reason MarketingFooter exists — no page can offer a different set of
// destinations from its neighbour.

type NavLink = {
  href: string;
  label: string;
  // The study platform is a separate application, served at /learn on this host
  // by a rewrite. Next's client router must not try to own those routes, so
  // they render as plain anchors and do a real navigation.
  external?: boolean;
};

export const MARKETING_NAV_LINKS: NavLink[] = [
  { href: '/learn/catalogue', label: 'Courses', external: true },
  { href: '/programmes', label: 'Programmes' },
  { href: '/news', label: 'Insights' },
  { href: '/updates', label: 'Updates' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export function MarketingNav({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);

  // Escape closes it, because a menu covering the page with no way back out
  // from the keyboard is a trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const renderLink = (link: NavLink) => {
    const props = {
      className: 'plain',
      'aria-current': current === link.href ? ('page' as const) : undefined,
      onClick: () => setOpen(false),
    };
    return link.external ? (
      <a key={link.href} href={link.href} {...props}>
        {link.label}
      </a>
    ) : (
      <Link key={link.href} href={link.href} {...props}>
        {link.label}
      </Link>
    );
  };

  return (
    <header className={`site-menu${open ? ' is-open' : ''}`}>
      <div className="wrap menu-bar">
        <Link href="/" aria-label="Knowsia home" onClick={() => setOpen(false)}>
          <Image
            src="/knowsia-logo.png"
            alt="Knowsia"
            width={185}
            height={68}
            priority
            className="logo"
          />
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="site-menu-links"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="menu-bars" aria-hidden="true" />
          <span>Menu</span>
        </button>

        <nav id="site-menu-links" className="menu-links" aria-label="Primary">
          {MARKETING_NAV_LINKS.map(renderLink)}
          {/*
            Unchanged from the old per-page nav: /portal is the REGISTRATION
            portal (programme participants), which is not the same login as the
            study platform at /learn. Two portals, two logins — preserved as it
            was rather than quietly repointed. Worth resolving, but that is a
            product decision, not a navigation fix.
          */}
          <Link href="/portal/login" className="plain menu-login" onClick={() => setOpen(false)}>
            Student login
          </Link>
        </nav>
      </div>
    </header>
  );
}
