import Link from 'next/link';
import { notFound } from 'next/navigation';

import * as newsInsightsService from '@/modules/news-insights/service';
import type { ArticleSections } from '@/modules/news-insights/types';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { Badge } from '@/components/ui/badge';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const SECTION_TITLES: { key: keyof ArticleSections; label: string }[] = [
  { key: 'whatHappened', label: 'What Happened' },
  { key: 'whyItMatters', label: 'Why It Matters' },
  { key: 'whoIsAffected', label: 'Who Is Affected' },
  { key: 'keyDetails', label: 'Key Details' },
  { key: 'whatShouldYouDo', label: 'What Should You Do' },
  { key: 'knowsiaAnalysis', label: 'Knowsia Analysis' },
];

// Article page structure per doc Section 14. "Verified" language only ever
// appears via transparency_labels, which is only ever set to include
// "Multiple sources verified" when the Verification Agent's independent
// pass actually passed (enforced in pipeline/publishing.ts, not this page).
export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let article;
  try {
    article = await newsInsightsService.getPublishedArticleBySlug(slug);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <KnowsiaHeader />
      <p className="mt-6 text-sm">
        <Link href="/news" className="text-muted-foreground hover:underline">
          Knowsia Insights
        </Link>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">{article.category}</Badge>
        {article.geography.map((g) => (
          <Badge key={g} variant="outline">
            {g}
          </Badge>
        ))}
        {article.transparencyLabels.map((label) => (
          <Badge key={label} className={label === 'Correction issued' ? 'bg-amber-500' : 'bg-muted text-foreground'}>
            {label}
          </Badge>
        ))}
      </div>

      <h1 className="mt-4 text-2xl font-semibold">{article.headline}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Published {new Date(article.publishedAt).toLocaleDateString()}
        {article.lastCorrectedAt ? ` — corrected ${new Date(article.lastCorrectedAt).toLocaleDateString()}` : ''}
      </p>
      <p className="mt-4 text-base">{article.summary}</p>

      <div className="mt-8 space-y-6">
        {SECTION_TITLES.map(({ key, label }) =>
          article.sections[key] ? (
            <section key={key}>
              <h2 className="text-lg font-semibold">{label}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{article.sections[key]}</p>
            </section>
          ) : null,
        )}
      </div>

      {article.sourceUrls.length > 0 && (
        <section className="mt-8 border-t pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Official Sources</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {article.sourceUrls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
