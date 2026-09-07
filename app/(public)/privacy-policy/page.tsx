import type { Metadata } from 'next';

import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import { appUrl } from '@/lib/app-url';

import { PRIVACY_EFFECTIVE_DATE, PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_VERSION } from './content';

// /privacy-policy — Knowsia's policy, written 2026-09-04 against what the two
// platforms actually do (see ./content.ts and its PRIVACY_REVIEW_NOTES). The
// legacy URL /privacy-policy/ 301s here at cutover (Coding Docs/20).

const APP_URL = appUrl();

export const metadata: Metadata = {
  title: 'Privacy Policy | Knowsia',
  description:
    'How Knowsia collects, uses and protects your personal data, under Ghana’s Data Protection Act, 2012 (Act 843) and, where applicable, the GDPR.',
  alternates: { canonical: `${APP_URL}/privacy-policy` },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <a href="#policy" className="skip">
        Skip to content
      </a>

      <MarketingNav />

      <header className="hero" style={{ paddingBottom: 48 }}>
        <div className="wrap">
          <p className="eyebrow">Legal</p>
          <h1 style={{ maxWidth: '20ch' }}>Privacy Policy</h1>
          <p className="lede">
            Version {PRIVACY_VERSION} · Effective {PRIVACY_EFFECTIVE_DATE}
          </p>
        </div>
      </header>

      <main id="policy" className="band">
        <div className="wrap">
          <div className="article prose" style={{ color: 'var(--ink-muted)' }}>
            <section>
              {PRIVACY_INTRO.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
            {PRIVACY_SECTIONS.map((section) => (
              <section key={section.heading}>
                <h2 style={{ color: 'var(--ink)' }}>{section.heading}</h2>
                {section.blocks.map((block, index) => {
                  if (block.type === 'h3') {
                    return (
                      <h3 key={index} style={{ marginTop: 20, fontSize: '1.05rem', color: 'var(--ink)' }}>
                        {block.text}
                      </h3>
                    );
                  }
                  if (block.type === 'ul') {
                    return (
                      <ul key={index} style={{ marginTop: 10, paddingLeft: 22, display: 'grid', gap: 6 }}>
                        {block.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={index} style={{ marginTop: 12 }}>
                      {block.text}
                    </p>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
