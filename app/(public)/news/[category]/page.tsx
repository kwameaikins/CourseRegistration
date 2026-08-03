import Link from 'next/link';
import { notFound } from 'next/navigation';

import * as newsInsightsService from '@/modules/news-insights/service';
import { slugToCategory } from '@/modules/news-insights/types';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export const dynamic = 'force-dynamic';

export default async function NewsCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: categorySlug } = await params;
  const category = slugToCategory(categorySlug);
  if (!category) notFound();

  const articles = await newsInsightsService.listPublishedArticles({ category, limit: 40 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <KnowsiaHeader />
      <p className="mt-6 text-sm">
        <Link href="/news" className="text-muted-foreground hover:underline">
          Knowsia Insights
        </Link>{' '}
        / {category}
      </p>
      <h1 className="mt-2 text-2xl font-semibold">{category}</h1>

      {articles.length === 0 && <p className="mt-8 text-muted-foreground">No stories in this category yet.</p>}

      <section className="mt-6 space-y-4">
        {articles.map((article) => (
          <Link key={article.id} href={`/news/article/${article.slug}`} className="block rounded-lg border p-4 hover:bg-muted/40">
            <h4 className="font-medium">{article.headline}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">{new Date(article.publishedAt).toLocaleDateString()}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
