import type { MetadataRoute } from 'next';

import { getPublicCourseCatalog } from '@/modules/courses/public-catalog';

// Sitemap (Revenue OS Phase 2, 2026-09-03). The public pages were invisible
// to crawlers beyond link discovery; a content-rich programme catalogue with
// no sitemap is free SEO left on the table.
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/programmes`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/register`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/news`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${BASE}/partners/apply`, changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Fail-soft: a database hiccup yields the static pages, never a 500 that
  // teaches crawlers this URL is broken.
  try {
    const catalog = await getPublicCourseCatalog();
    return [
      ...staticPages,
      ...catalog.map((course) => ({
        url: `${BASE}/programmes/${encodeURIComponent(course.courseCode)}`,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch (err) {
    console.error('[sitemap]', err);
    return staticPages;
  }
}
