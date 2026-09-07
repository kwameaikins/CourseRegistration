import Link from 'next/link';

import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import * as newsInsightsService from '@/modules/news-insights/service';
import { NEWS_CATEGORIES, categoryToSlug } from '@/modules/news-insights/types';

export const dynamic = 'force-dynamic';

// Knowsia Insights public homepage (doc Section 13, Phase 1 slice: Top
// Stories + Latest Updates + Upcoming Deadlines — Standards Tracker,
// Technology & AI section, Start-up Watch, and Weekly Briefing signup stay
// Phase 2).
//
// Redesigned 2026-09-07 onto the marketing shell. It had been a max-w-3xl
// column of bordered boxes on the Tailwind shell, which was defensible while
// nothing linked to it — and stopped being defensible the day Insights went
// into the site menu. It now shares the navy hero, the Georgia display face
// and the card language of every other public page, so a reader arriving from
// the menu does not appear to have left the site.
//
// Two things the old page had and threw away, both of which a news index needs:
// every article carries publishedAt (never null), and nothing showed it — a
// reader could not tell a story from this morning from one in August. And the
// category list existed only as a strip of pills with no sense of what was in
// them. Dates are now on every story, in en-GB, with tabular numerals so a
// column of them aligns.

const PAGE_CSS = `
.mk .news-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 30px; }
.mk .news-chip {
  display: inline-flex; align-items: center; min-height: 34px; padding: 0 14px;
  border-radius: 999px; border: 1px solid var(--rail-line); color: var(--rail-fg-muted);
  font-size: 13px; text-decoration: none; transition: background .18s, color .18s;
}
.mk .news-chip:hover { background: var(--rail-active-bg); color: var(--rail-fg); }
.mk .news-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.mk .news-date { font-size: 12.5px; color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.mk .news-lead {
  display: block; background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; padding: 30px; box-shadow: var(--shadow);
  text-decoration: none; color: inherit; transition: border-color .18s, transform .18s;
}
.mk .news-lead:hover { border-color: var(--accent); transform: translateY(-2px); }
.mk .news-lead h2 { font-size: clamp(1.4rem, 3vw, 1.95rem); letter-spacing: -0.01em; margin-top: 12px; }
.mk .news-lead p { margin-top: 12px; color: var(--ink-muted); max-width: 62ch; }
.mk .news-grid { display: grid; gap: 20px; grid-template-columns: 1fr; }
@media (min-width: 700px) { .mk .news-grid { grid-template-columns: 1fr 1fr; } }
.mk .news-card {
  display: flex; flex-direction: column; background: var(--surface);
  border: 1px solid var(--line); border-radius: 14px; padding: 22px;
  text-decoration: none; color: inherit; transition: border-color .18s, transform .18s;
}
.mk .news-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.mk .news-card h3 { font-size: 1.08rem; line-height: 1.35; margin-top: 10px; }
.mk .news-card p { margin-top: 8px; color: var(--ink-muted); font-size: 14.5px; }
.mk .deadline-list { display: grid; gap: 10px; }
.mk .deadline {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: 4px 16px; background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; padding: 16px 18px;
}
.mk .deadline strong { font-size: 15px; }
.mk .deadline .who { font-size: 13px; color: var(--ink-muted); }
.mk .deadline .when { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mk .deadline .soon { color: var(--danger); }
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

// Ghana runs on UTC year-round (BR-17), so a plain day difference is honest here.
function daysUntil(iso: string): number {
  const then = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((then - today) / 86_400_000);
}

function deadlineWhen(iso: string): { text: string; soon: boolean } {
  const days = daysUntil(iso);
  if (days <= 0) return { text: 'Today', soon: true };
  if (days === 1) return { text: 'Tomorrow', soon: true };
  if (days <= 14) return { text: `In ${days} days`, soon: true };
  return { text: fmtDate(iso), soon: false };
}

export const metadata = {
  title: 'Knowsia Insights | News and analysis for finance professionals',
  description:
    'News and analysis for accountants, auditors and finance professionals in Ghana and across West Africa — what changed at the standard setters and professional bodies, and what it means for your work.',
};

export default async function NewsHomePage() {
  const [articles, deadlines] = await Promise.all([
    newsInsightsService.listPublishedArticles({ limit: 20 }),
    newsInsightsService.listUpcomingDeadlines(8),
  ]);

  const [topStory, ...rest] = articles;

  return (
    <div className="mk">
      <style>{MARKETING_STYLES + PAGE_CSS}</style>
      <MarketingIcons />
      <a href="#insights" className="skip">
        Skip to content
      </a>

      <MarketingNav current="/news" />

      <header className="hero" style={{ paddingBottom: 52 }}>
        <div className="wrap">
          <p className="eyebrow">Knowsia Insights</p>
          <h1 style={{ maxWidth: '22ch' }}>News and analysis for people who own the numbers</h1>
          <p className="lede">
            What changed at the professional bodies and the standard setters, written for
            accountants, auditors and finance professionals — and checked against its sources
            before it goes up.
          </p>
          <nav className="news-chips" aria-label="Categories">
            {NEWS_CATEGORIES.map((category) => (
              <Link key={category} href={`/news/${categoryToSlug(category)}`} className="news-chip">
                {category}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="insights">
        <section className="band" style={{ paddingBottom: articles.length > 1 ? 0 : undefined }}>
          <div className="wrap">
            {articles.length === 0 ? (
              <div className="news-empty">
                No stories published yet — check back shortly.
              </div>
            ) : null}

            {topStory ? (
              <Link href={`/news/article/${topStory.slug}`} className="news-lead">
                <div className="news-meta">
                  <span className="tag tag-code">{topStory.category}</span>
                  <span className="news-date">{fmtDate(topStory.publishedAt)}</span>
                </div>
                <h2>{topStory.headline}</h2>
                <p>{topStory.summary}</p>
              </Link>
            ) : null}
          </div>
        </section>

        {rest.length > 0 ? (
          <section className="band">
            <div className="wrap">
              <div className="band-head">
                <p className="kicker">Latest</p>
                <h2>More from Insights</h2>
              </div>
              <div className="news-grid">
                {rest.map((article) => (
                  <Link
                    key={article.id}
                    href={`/news/article/${article.slug}`}
                    className="news-card"
                  >
                    <div className="news-meta">
                      <span className="tag tag-code">{article.category}</span>
                      <span className="news-date">{fmtDate(article.publishedAt)}</span>
                    </div>
                    <h3>{article.headline}</h3>
                    <p>{article.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {deadlines.length > 0 ? (
          <section className="band band-tint">
            <div className="wrap">
              <div className="band-head">
                <p className="kicker">Diary</p>
                <h2>Upcoming deadlines</h2>
                <p>Filing and examination dates worth having in front of you.</p>
              </div>
              <ul className="deadline-list">
                {deadlines.map((deadline) => {
                  const when = deadlineWhen(deadline.deadlineDate);
                  return (
                    <li key={deadline.id} className="deadline">
                      <span>
                        <strong>{deadline.title}</strong>
                        <br />
                        <span className="who">
                          {deadline.professionalBody ?? deadline.category}
                        </span>
                      </span>
                      <span className={`when${when.soon ? ' soon' : ''}`}>{when.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : null}
      </main>

      <MarketingFooter />
    </div>
  );
}
