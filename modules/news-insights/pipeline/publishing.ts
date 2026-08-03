import * as newsRepository from '@/modules/news-insights/repository';
import type { ArticleSections, Story } from '@/modules/news-insights/types';
import type { Database } from '@/lib/supabase/database.types';

type ArticleDraftRow = Database['public']['Tables']['article_drafts']['Row'];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function uniqueSlug(headline: string): Promise<string> {
  const base = slugify(headline) || 'story';
  let candidate = base;
  let attempt = 1;
  while (await newsRepository.selectPublishedArticleBySlug(candidate)) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

function buildTransparencyLabels(params: {
  verificationPassed: boolean;
  humanReviewed: boolean;
  story: Story;
}): string[] {
  const labels = new Set<string>(['AI-researched']);
  if (params.verificationPassed) labels.add('Multiple sources verified');
  if (params.humanReviewed) labels.add('Human-reviewed');
  if (params.story.importance === 'Developing') labels.add('Developing story');
  if (params.story.contentType === 'Analysis') labels.add('Analysis');
  if (params.story.contentType === 'Opinion') labels.add('Opinion');
  if (params.story.contentType === 'Professional Announcement') labels.add('Official announcement');
  return Array.from(labels);
}

// Publishing Agent (doc Section 4, #6). "Verified" language on the public
// site (transparency_labels) only ever appears when verificationPassed is
// actually true — this is the one place doc Section 7's rule is enforced in
// code, not just documented (buildTransparencyLabels above).
export async function publishStoryFromDraft(params: {
  story: Story;
  draft: ArticleDraftRow;
  riskLevel: 1 | 2 | 3;
  verificationPassed: boolean;
  humanReviewed: boolean;
  overrides?: {
    headline?: string;
    summary?: string;
    sections?: ArticleSections;
  };
}): Promise<{ slug: string }> {
  const headline = params.overrides?.headline ?? params.draft.draft_headline ?? params.story.canonicalTitle;
  const summary = params.overrides?.summary ?? params.draft.draft_summary ?? '';
  const sections = params.overrides?.sections ?? (params.draft.draft_sections as unknown as ArticleSections);

  const slug = await uniqueSlug(headline);
  const sourceUrls = await newsRepository.selectStorySourceUrls(params.story.id);
  const labels = buildTransparencyLabels({
    verificationPassed: params.verificationPassed,
    humanReviewed: params.humanReviewed,
    story: params.story,
  });

  await newsRepository.insertPublishedArticle({
    story_id: params.story.id,
    slug,
    headline,
    summary,
    sections: sections as unknown as Database['public']['Tables']['published_articles']['Insert']['sections'],
    category: params.story.category,
    subcategories: params.story.subcategories,
    geography: params.story.geography,
    audience: params.story.audience,
    content_type: params.story.contentType,
    importance: params.story.importance,
    transparency_labels: labels,
    risk_level: params.riskLevel,
    source_urls: sourceUrls,
    seo_title: headline,
    seo_description: summary.slice(0, 160),
  });

  await newsRepository.updateStory(params.story.id, { status: 'published' });

  return { slug };
}
