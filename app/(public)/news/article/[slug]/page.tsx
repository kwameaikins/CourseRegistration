import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import * as newsInsightsService from '@/modules/news-insights/service';
import type { ArticleSections } from '@/modules/news-insights/types';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const SECTION_TITLES: { key: keyof ArticleSections; label: string }[] = [
  { key: 'whatHappened', label: 'What happened' },
  { key: 'whyItMatters', label: 'Why it matters' },
  { key: 'whoIsAffected', label: 'Who is affected' },
  { key: 'keyDetails', label: 'Key details' },
  { key: 'whatShouldYouDo', label: 'What should you do' },
  { key: 'knowsiaAnalysis', label: 'Knowsia analysis' },
];

// Article page structure per doc Section 14. "Verified" language only ever
// appears via transparency_labels, which is only ever set to include
// "Multiple sources verified" when the Verification Agent's independent pass
// actually passed (enforced in pipeline/publishing.ts, not this page).
//
// Redesigned 2026-09-07 with the index, onto the marketing shell. Reading is
// the whole job here, so the body is set in the `prose` measure at a size meant
// for continuous text rather than the 14px the shadcn shell gave it, and the
// six section headings carry the Georgia display face that every other heading
// on the site uses.
//
// The transparency labels and the source list keep their prominence — they are
// the reason a reader should believe any of this, and burying them to make the
// page prettier would be the one change worth refusing.

const PAGE_CSS = `
.mk .art-labels { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.mk .art-dateline { margin-top: 14px; font-size: 13.5px; color: var(--rail-fg-muted); font-variant-numeric: tabular-nums; }
.mk .art-summary { margin-top: 22px; font-size: 1.06rem; line-height: 1.6; color: var(--ink-muted); }
.mk .art-body section + section { margin-top: 34px; }
.mk .art-body h2 { font-family: var(--font-display); font-size: 1.3rem; letter-spacing: -0.01em; }
.mk .art-body p { margin-top: 10px; white-space: pre-line; font-size: 16.5px; line-height: 1.72; }
.mk .art-sources { margin-top: 44px; padding-top: 26px; border-top: 1px solid var(--line); }
.mk .art-sources h2 { font-size: 12px; font-weight: 600; letter-spacing: 0.10em; text-transform: uppercase; color: var(--accent); }
.mk .art-sources ul { margin-top: 12px; display: grid; gap: 8px; list-style: none; }
.mk .art-sources a { font-size: 14px; color: var(--ink-muted); word-break: break-all; }
.mk .art-sources a:hover { color: var(--accent); }
.mk .tag-correction { background: var(--warning-bg); color: var(--warning); }
`;

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let article;
  try {
    article = await newsInsightsService.getPublishedArticleBySlug(slug);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  const published = new Date(article.publishedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const corrected = article.lastCorrectedAt
    ? new Date(article.lastCorrectedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="mk">
      <style>{MARKETING_STYLES + PAGE_CSS}</style>
      <MarketingIcons />
      <a href="#story" className="skip">
        Skip to the story
      </a>

      <MarketingNav current="/news" />

      <header className="hero" style={{ paddingBottom: 48 }}>
        <div className="wrap prose">
          <p className="eyebrow">
            <Link href="/news" style={{ color: 'inherit' }}>
              Knowsia Insights
            </Link>
          </p>
          <div className="art-labels" style={{ marginTop: 14 }}>
            <span className="tag tag-code">{article.category}</span>
            {article.geography.map((place) => (
              <span key={place} className="tag">
                {place}
              </span>
            ))}
            {article.transparencyLabels.map((label) => (
              <span
                key={label}
                className={`tag${label === 'Correction issued' ? ' tag-correction' : ''}`}
              >
                {label}
              </span>
            ))}
          </div>
          <h1 style={{ maxWidth: '24ch' }}>{article.headline}</h1>
          <p className="art-dateline">
            Published {published}
            {corrected ? ` · corrected ${corrected}` : ''}
          </p>
        </div>
      </header>

      <main id="story" className="band">
        <div className="wrap prose">
          <p className="art-summary">{article.summary}</p>

          <div className="art-body" style={{ marginTop: 40 }}>
            {SECTION_TITLES.map(({ key, label }) =>
              article.sections[key] ? (
                <section key={key}>
                  <h2>{label}</h2>
                  <p>{article.sections[key]}</p>
                </section>
              ) : null,
            )}
          </div>

          {article.sourceUrls.length > 0 ? (
            <section className="art-sources">
              <h2>Official sources</h2>
              <ul>
                {article.sourceUrls.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p style={{ marginTop: 40 }}>
            <Link href="/news" className="btn btn-outline btn-sm">
              More from Insights
            </Link>
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
