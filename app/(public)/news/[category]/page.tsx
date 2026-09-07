import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import * as newsInsightsService from '@/modules/news-insights/service';
import { NEWS_CATEGORIES, categoryToSlug, slugToCategory } from '@/modules/news-insights/types';

export const dynamic = 'force-dynamic';

// One category of Knowsia Insights. Redesigned 2026-09-07 with the index and
// the article page onto the marketing shell — a reader moving index → category
// → story should not cross three visual languages to read one thing.
//
// The category strip stays on this page rather than only on the index, with the
// current one marked, because arriving here from a story is at least as common
// as arriving from the index and a dead end is a dead end either way.

const PAGE_CSS = `
.mk .news-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 26px; }
.mk .news-chip {
  display: inline-flex; align-items: center; min-height: 34px; padding: 0 14px;
  border-radius: 999px; border: 1px solid var(--rail-line); color: var(--rail-fg-muted);
  font-size: 13px; text-decoration: none; transition: background .18s, color .18s;
}
.mk .news-chip:hover { background: var(--rail-active-bg); color: var(--rail-fg); }
.mk .news-chip[aria-current="page"] { background: var(--rail-accent); border-color: var(--rail-accent); color: #1C1109; font-weight: 600; }
.mk .news-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.mk .news-date { font-size: 12.5px; color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.mk .news-grid { display: grid; gap: 20px; grid-template-columns: 1fr; }
@media (min-width: 700px) { .mk .news-grid { grid-template-columns: 1fr 1fr; } }
.mk .news-card {
  display: flex; flex-direction: column; background: var(--surface);
  border: 1px solid var(--line); border-radius: 14px; padding: 22px;
  text-decoration: none; color: inherit; transition: border-color .18s, transform .18s;
}
.mk .news-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.mk .news-card h2 { font-size: 1.08rem; line-height: 1.35; margin-top: 10px; }
.mk .news-card p { margin-top: 8px; color: var(--ink-muted); font-size: 14.5px; }
.mk .news-empty {
  border: 1px dashed var(--line); border-radius: 14px; background: var(--surface);
  padding: 44px 24px; text-align: center; color: var(--ink-faint);
}
`;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default async function NewsCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: categorySlug } = await params;
  const category = slugToCategory(categorySlug);
  if (!category) notFound();

  const articles = await newsInsightsService.listPublishedArticles({ category, limit: 40 });

  return (
    <div className="mk">
      <style>{MARKETING_STYLES + PAGE_CSS}</style>
      <MarketingIcons />
      <a href="#stories" className="skip">
        Skip to content
      </a>

      <MarketingNav current="/news" />

      <header className="hero" style={{ paddingBottom: 48 }}>
        <div className="wrap">
          <p className="eyebrow">
            <Link href="/news" style={{ color: 'inherit' }}>
              Knowsia Insights
            </Link>
          </p>
          <h1 style={{ maxWidth: '22ch' }}>{category}</h1>
          <nav className="news-chips" aria-label="Categories">
            {NEWS_CATEGORIES.map((name) => (
              <Link
                key={name}
                href={`/news/${categoryToSlug(name)}`}
                className="news-chip"
                aria-current={name === category ? 'page' : undefined}
              >
                {name}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="stories" className="band">
        <div className="wrap">
          {articles.length === 0 ? (
            <div className="news-empty">No stories in this category yet.</div>
          ) : (
            <div className="news-grid">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/news/article/${article.slug}`}
                  className="news-card"
                >
                  <div className="news-meta">
                    <span className="news-date">{fmtDate(article.publishedAt)}</span>
                  </div>
                  <h2>{article.headline}</h2>
                  <p>{article.summary}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
