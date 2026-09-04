import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { EnquiryForm } from '@/components/EnquiryForm';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import { appUrl } from '@/lib/app-url';
import { ORGANISATION_EMAIL, ORGANISATION_PHONES, whatsappUrl } from '@/lib/organisation';

// /contact — successor to knowsia.com/contact-2/ (Coding Docs/20, Phase 2).
// Contact details come from lib/organisation.ts, the same constants the home
// page, footers and PDFs use, so no page can disagree with another. The
// enquiry form is the existing lead-capture component, so a message here
// lands in the leads queue like any other enquiry.

const APP_URL = appUrl();
const WHATSAPP_CONTACT_URL = whatsappUrl();
const [PRIMARY_PHONE, SECONDARY_PHONE] = ORGANISATION_PHONES;

export const metadata: Metadata = {
  title: 'Contact Knowsia | Talk to us about training',
  description:
    'Reach Knowsia by phone, WhatsApp or email, or send us a message. We answer questions about programmes, registration, payments, certificates and corporate training.',
  alternates: { canonical: `${APP_URL}/contact` },
  openGraph: {
    title: 'Contact Knowsia',
    description: 'Phone, WhatsApp, email — or send us a message.',
    url: `${APP_URL}/contact`,
    siteName: 'Knowsia',
    type: 'website',
  },
};

const CHANNELS = [
  {
    icon: 'm-users',
    title: 'WhatsApp',
    body: 'Fastest for a quick question about a programme or a registration.',
    href: WHATSAPP_CONTACT_URL,
    label: 'Chat on WhatsApp',
    external: true,
  },
  {
    icon: 'm-live',
    title: 'Call us',
    body: `${PRIMARY_PHONE.display} or ${SECONDARY_PHONE.display}, Monday to Friday during business hours.`,
    href: `tel:${PRIMARY_PHONE.tel}`,
    label: `Call ${PRIMARY_PHONE.display}`,
    external: false,
  },
  {
    icon: 'm-award',
    title: 'Email',
    body: 'For corporate training, partnerships, invoices and anything that needs a paper trail.',
    href: `mailto:${ORGANISATION_EMAIL}`,
    label: ORGANISATION_EMAIL,
    external: false,
  },
];

const SELF_SERVICE = [
  { href: '/portal/login', title: 'Student portal', body: 'Class links, payments, receipts and certificates.' },
  { href: '/verify', title: 'Verify a certificate', body: 'Confirm a Knowsia certificate is genuine.' },
  { href: '/company-portal/login', title: 'Corporate portal', body: 'Manage your organisation’s seats and employees.' },
];

export default function ContactPage() {
  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <a href="#contact" className="skip">
        Skip to content
      </a>

      <header className="hero" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <nav className="hero-nav">
            <Link href="/">
              <Image src="/knowsia-logo.png" alt="Knowsia" width={185} height={68} priority className="logo" />
            </Link>
            <Link href="/programmes" className="plain">
              All programmes
            </Link>
          </nav>

          <p className="eyebrow">Contact</p>
          <h1 style={{ maxWidth: '20ch' }}>Need help or a service?</h1>
          <p className="lede">
            Reach us through any of the channels below. We are in Accra, Ghana, and every
            programme runs live online.
          </p>
        </div>
      </header>

      <main id="contact">
        <section className="band">
          <div className="wrap">
            <div className="grid-3">
              {CHANNELS.map((channel) => (
                <div key={channel.title} className="feature">
                  <span className="icon-badge">
                    <svg className="icon" aria-hidden>
                      <use href={`#${channel.icon}`} />
                    </svg>
                  </span>
                  <h3>{channel.title}</h3>
                  <p>{channel.body}</p>
                  <p style={{ marginTop: 12 }}>
                    <a
                      href={channel.href}
                      className="btn btn-outline btn-sm"
                      {...(channel.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    >
                      {channel.label}
                    </a>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band band-tint">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Send us a message</p>
              <h2>Tell us what you need</h2>
              <p>Programme details, group bookings, partnerships — we reply within one business day.</p>
            </div>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <EnquiryForm />
            </div>
          </div>
        </section>

        <section className="band">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Already with us?</p>
              <h2>You may not need to wait for a reply</h2>
            </div>
            <div className="grid-3">
              {SELF_SERVICE.map((item) => (
                <Link key={item.href} href={item.href} className="feature">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
