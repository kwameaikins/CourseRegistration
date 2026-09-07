import type { Metadata } from 'next';
import Link from 'next/link';

import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import { appUrl } from '@/lib/app-url';

import { UPDATES_SORTED } from './content';

// /updates — the product and company log (founder request, 2026-09-07).
// Distinct from /news (Knowsia Insights, industry journalism); see ./content.ts
// for the split and the two rules that govern entries.

const APP_URL = appUrl();

export const metadata: Metadata = {
  title: 'Updates | Knowsia',
  description:
    'What is new at Knowsia — platform releases, new programmes and company announcements, newest first.',
  alternates: { canonical: `${APP_URL}/updates` },
};

export default function UpdatesPage() {
  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <a href="#updates" className="skip">
        Skip to content
      </a>

      <MarketingNav current="/updates" />

      <header className="hero" style={{ paddingBottom: 48 }}>
        <div className="wrap">
          <p className="eyebrow">Updates</p>
          <h1 style={{ maxWidth: '20ch' }}>What is new at Knowsia</h1>
          <p className="lede">
            Platform releases, new programmes and company announcements — newest first. For
            accounting and finance news, read{' '}
            <Link href="/news" style={{ color: 'inherit' }}>
              Knowsia Insights
            </Link>
            .
          </p>
        </div>
      </header>

      <main id="updates" className="band">
        <div className="wrap">
          {UPDATES_SORTED.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)' }}>
              Nothing posted yet. Check back shortly.
            </p>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 28 }}>
              {UPDATES_SORTED.map((entry) => (
                <li key={entry.date + entry.title} className="feature">
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <time
                      dateTime={entry.date}
                      style={{ fontSize: 13, color: 'var(--ink-muted)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {entry.displayDate}
                    </time>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--rail-accent)',
                      }}
                    >
                      {entry.category}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>{entry.title}</h2>
                  <p style={{ marginTop: 10, color: 'var(--ink-muted)' }}>{entry.body}</p>
                  {entry.link ? (
                    <p style={{ marginTop: 14 }}>
                      {/* /learn is a separate application behind a rewrite, so
                          those links must be a real navigation, not a client
                          route this app cannot own. */}
                      {entry.link.external ? (
                        <a href={entry.link.href} className="btn btn-outline btn-sm">
                          {entry.link.label}
                        </a>
                      ) : (
                        <Link href={entry.link.href} className="btn btn-outline btn-sm">
                          {entry.link.label}
                        </Link>
                      )}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
