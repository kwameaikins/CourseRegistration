import type { MetadataRoute } from 'next';

import { appUrl } from '@/lib/app-url';
import { getPublicCourseCatalog } from '@/modules/courses/public-catalog';
import * as newsInsightsService from '@/modules/news-insights/service';

// Sitemap (Revenue OS Phase 2, 2026-09-03). The public pages were invisible
// to crawlers beyond link discovery; a content-rich programme catalogue with
// no sitemap is free SEO left on the table.
//
// Domain consolidation (Coding Docs/20, 2026-09-04): published news articles
// are listed too, because the 85 WordPress blog posts land at
// /news/article/{slug} and every one of them must be discoverable the day
// its old URL starts redirecting here.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/programmes`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/register`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/news`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/partners/apply`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/privacy-policy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/verify`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Each source fails soft on its own: a database hiccup in one must not
  // drop the other, and never a 500 that teaches crawlers this URL is broken.
  const [catalogEntries, articleEntries] = await Promise.all([
    getPublicCourseCatalog()
      .then((catalog) =>
        catalog.map((course) => ({
          url: `${base}/programmes/${encodeURIComponent(course.courseCode)}`,
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        })),
      )
      .catch((err: unknown) => {
        console.error('[sitemap] catalog', err);
        return [] as MetadataRoute.Sitemap;
      }),
    newsInsightsService
      .listPublishedArticles({ limit: 100 })
      .then((articles) =>
        articles.map((article) => ({
          url: `${base}/news/article/${encodeURIComponent(article.slug)}`,
          lastModified: article.updatedAt ?? article.publishedAt,
          changeFrequency: 'monthly' as const,
          priority: 0.5,
        })),
      )
      .catch((err: unknown) => {
        console.error('[sitemap] news', err);
        return [] as MetadataRoute.Sitemap;
      }),
  ]);

  return [...staticPages, ...catalogEntries, ...articleEntries];
}
