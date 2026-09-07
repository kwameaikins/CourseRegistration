import Link from 'next/link';

import {
  ORGANISATION_EMAIL,
  ORGANISATION_LOCATION,
  ORGANISATION_NAME,
  ORGANISATION_PHONES,
} from '@/lib/organisation';

// Shared footer for every marketing page (home, programmes, programme
// detail, /about, /contact, /privacy-policy). Contact details come from
// lib/organisation.ts, the same constants the PDFs and the contact page use,
// so no page can quote a different number or address.
export function MarketingFooter() {
  const [primary, secondary] = ORGANISATION_PHONES;
  return (
    <footer className="foot">
      <div className="wrap">
        <p>
          Questions before registering? Call{' '}
          <a href={`tel:${primary.tel}`}>{primary.display}</a> or{' '}
          <a href={`tel:${secondary.tel}`}>{secondary.display}</a>, or email{' '}
          <a href={`mailto:${ORGANISATION_EMAIL}`}>{ORGANISATION_EMAIL}</a>
        </p>
        <p style={{ marginTop: 10 }}>
          <a href="/learn/catalogue">Courses</a>
          {' · '}
          <Link href="/programmes">All programmes</Link>
          {' · '}
          <Link href="/news">Insights</Link>
          {' · '}
          <Link href="/updates">Updates</Link>
          {' · '}
          <Link href="/about">About</Link>
          {' · '}
          <Link href="/contact">Contact</Link>
          {' · '}
          <Link href="/verify">Verify a certificate</Link>
          {' · '}
          <Link href="/portal/login">Student portal</Link>
          {' · '}
          <Link href="/privacy-policy">Privacy</Link>
        </p>
        <p style={{ marginTop: 10 }}>{ORGANISATION_NAME} · {ORGANISATION_LOCATION}</p>
      </div>
    </footer>
  );
}
