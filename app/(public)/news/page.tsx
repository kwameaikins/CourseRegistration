import Link from 'next/link';

import * as newsInsightsService from '@/modules/news-insights/service';
import { NEWS_CATEGORIES, categoryToSlug } from '@/modules/news-insights/types';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export const dynamic = 'force-dynamic';

// Knowsia Insights public homepage (doc Section 13, Phase 1 slice: Top
// Stories + Latest Updates + Upcoming Deadlines — Standards Tracker,
// Technology & AI section, Start-up Watch, and Weekly Briefing signup stay
// Phase 2). No shared (public) layout in this app — each page self-includes
// KnowsiaHeader, same as /register and /verify.
export default async function NewsHomePage() {
  const [articles, deadlines] = await Promise.all([
    newsInsightsService.listPublishedArticles({ limit: 20 }),
    newsInsightsService.listUpcomingDeadlines(8),
  ]);

  const [topStory, ...rest] = articles;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Knowsia Insights</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        News and analysis for accountants, auditors, and finance professionals.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        {NEWS_CATEGORIES.map((category) => (
          <Link
            key={category}
            href={`/news/${categoryToSlug(category)}`}
            className="rounded-full border px-3 py-1 hover:bg-muted"
          >
            {category}
          </Link>
        ))}
      </nav>

      {articles.length === 0 && (
        <p className="mt-10 text-muted-foreground">
          No stories published yet — check back soon.
        </p>
      )}

      {topStory && (
        <section className="mt-8">
          <Link href={`/news/article/${topStory.slug}`} className="block rounded-lg border p-5 hover:bg-muted/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{topStory.category}</p>
            <h2 className="mt-1 text-xl font-semibold">{topStory.headline}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{topStory.summary}</p>
          </Link>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold">Latest Updates</h3>
          {rest.map((article) => (
            <Link
              key={article.id}
              href={`/news/article/${article.slug}`}
              className="block rounded-lg border p-4 hover:bg-muted/40"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{article.category}</p>
              <h4 className="mt-1 font-medium">{article.headline}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
            </Link>
          ))}
        </section>
      )}

      {deadlines.length > 0 && (
        <section className="mt-10">
          <h3 className="text-lg font-semibold">Upcoming Deadlines</h3>
          <ul className="mt-3 space-y-2">
            {deadlines.map((deadline) => (
              <li key={deadline.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{deadline.title}</p>
                <p className="text-xs text-muted-foreground">
                  {deadline.professionalBody ?? deadline.category} — {new Date(deadline.deadlineDate).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
