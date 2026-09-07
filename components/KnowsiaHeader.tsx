'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { MARKETING_NAV_LINKS, STUDENT_LOGIN_HREF } from '@/components/marketing/nav-links';

// Brand lockup for the public pages that are NOT on the `.mk` marketing shell
// — /news, /verify, /register, /feedback and the portal login screens.
//
// It used to be a bare <Image>: no link home, no navigation. So a visitor who
// clicked Insights in the site menu landed on /news and the menu simply
// vanished, with no way back except the browser button (founder report,
// 2026-09-07). Two shells is a real constraint — these pages are Tailwind, the
// marketing pages are scoped `.mk` CSS — but "no navigation at all" was not a
// design decision, it was an omission.
//
// The links come from components/marketing/nav-links, the same list
// MarketingNav renders, so the two shells can never offer different
// destinations.
//
// `nav` is opt-in. Content pages (news, verify, register) want the full menu;
// a PIN reset screen does not — a person mid-way through recovering their
// login should not be offered seven ways to leave. Those pages still get the
// logo as a link home, which is the part that was actually missing.
export function KnowsiaHeader({ nav = false }: { nav?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const logo = (
    <Link href="/" aria-label="Knowsia home" className="inline-block">
      <Image
        src="/knowsia-logo.png"
        alt="Knowsia"
        width={185}
        height={68}
        priority
        className="h-10 w-auto"
      />
    </Link>
  );

  if (!nav) return logo;

  const links = MARKETING_NAV_LINKS.map((link) =>
    link.external ? (
      <a
        key={link.href}
        href={link.href}
        className="whitespace-nowrap py-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(false)}
      >
        {link.label}
      </a>
    ) : (
      <Link
        key={link.href}
        href={link.href}
        className="whitespace-nowrap py-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(false)}
      >
        {link.label}
      </Link>
    ),
  );

  return (
    <header className="border-b pb-3">
      <div className="flex items-center justify-between gap-4">
        {logo}
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm md:hidden"
          aria-expanded={open}
          aria-controls="knowsia-header-links"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>
        <nav
          id="knowsia-header-links"
          aria-label="Primary"
          className="hidden flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm md:flex"
        >
          {links}
          <Link
            href={STUDENT_LOGIN_HREF}
            className="whitespace-nowrap py-1 font-semibold hover:underline"
          >
            Student login
          </Link>
        </nav>
      </div>
      {open ? (
        <nav aria-label="Primary" className="flex flex-col gap-1 pt-3 text-sm md:hidden">
          {links}
          <Link
            href={STUDENT_LOGIN_HREF}
            className="py-1 font-semibold hover:underline"
            onClick={() => setOpen(false)}
          >
            Student login
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
