'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

// A link that reports its click to GA4 and the Meta Pixel when they are
// loaded (components/AnalyticsScripts.tsx), and is an ordinary link when
// they are not. The home page has two doors — live programmes and the study
// platform — and without click events nobody can tell which one visitors
// actually take (Coding Docs/20, home page rebuild 2026-09-04).
//
// Never blocks navigation: the analytics calls are fire-and-forget.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

interface TrackedLinkProps {
  href: string;
  event: string;
  className?: string;
  children: ReactNode;
  external?: boolean;
}

function report(event: string, href: string) {
  try {
    window.gtag?.('event', event, { link_url: href });
    window.fbq?.('trackCustom', event, { link_url: href });
  } catch {
    /* analytics must never break a click */
  }
}

export function TrackedLink({ href, event, className, children, external = false }: TrackedLinkProps) {
  if (external || href.startsWith('#')) {
    return (
      <a
        href={href}
        className={className}
        onClick={() => report(event, href)}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={() => report(event, href)}>
      {children}
    </Link>
  );
}
