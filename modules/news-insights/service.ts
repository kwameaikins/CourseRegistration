import { AppError } from '@/lib/errors';
import * as newsRepository from '@/modules/news-insights/repository';
import * as usersService from '@/modules/users/service';
import type { Database } from '@/lib/supabase/database.types';
import type {
  ArticleSections,
  CreateCorrectionInput,
  CreateNewsSourceInput,
  Deadline,
  EditorialReview,
  ListPublishedArticlesFilters,
  NewsSource,
  PipelineJob,
  PublishedArticle,
  Story,
  SubmitReviewInput,
  UpdateNewsSourceInput,
} from '@/modules/news-insights/types';
import { createNewsSourceInputSchema, submitReviewInputSchema, updateNewsSourceInputSchema } from '@/modules/news-insights/types';

type NewsSourceRow = Database['public']['Tables']['news_sources']['Row'];
type StoryRow = Database['public']['Tables']['stories']['Row'];
type PublishedArticleRow = Database['public']['Tables']['published_articles']['Row'];
type DeadlineRow = Database['public']['Tables']['deadlines']['Row'];
type PipelineJobRow = Database['public']['Tables']['pipeline_jobs']['Row'];
type EditorialReviewRow = Database['public']['Tables']['editorial_reviews']['Row'];
type ArticleDraftRow = Database['public']['Tables']['article_drafts']['Row'];

const EDITORIAL_ROLES = ['admin', 'marketing'] as const;

function toNewsSource(row: NewsSourceRow): NewsSource {
  return {
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    sourceType: row.source_type as NewsSource['sourceType'],
    tier: row.tier as NewsSource['tier'],
    defaultCategory: row.default_category as NewsSource['defaultCategory'],
    reliabilityScore: row.reliability_score,
    status: row.status as NewsSource['status'],
    lastFetchedAt: row.last_fetched_at,
    lastFetchError: row.last_fetch_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toStory(row: StoryRow): Story {
  return {
    id: row.id,
    canonicalTitle: row.canonical_title,
    category: row.category as Story['category'],
    subcategories: row.subcategories,
    geography: row.geography,
    audience: row.audience,
    contentType: row.content_type,
    importance: row.importance,
    status: row.status as Story['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublishedArticle(row: PublishedArticleRow): PublishedArticle {
  return {
    id: row.id,
    storyId: row.story_id,
    slug: row.slug,
    headline: row.headline,
    summary: row.summary,
    sections: row.sections as unknown as ArticleSections,
    category: row.category as PublishedArticle['category'],
    subcategories: row.subcategories,
    geography: row.geography,
    audience: row.audience,
    contentType: row.content_type,
    importance: row.importance,
    transparencyLabels: row.transparency_labels,
    riskLevel: row.risk_level as PublishedArticle['riskLevel'],
    sourceUrls: row.source_urls,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    imageUrl: row.image_url,
    viewCount: row.view_count,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    lastCorrectedAt: row.last_corrected_at,
  };
}

function toDeadline(row: DeadlineRow): Deadline {
  return {
    id: row.id,
    title: row.title,
    professionalBody: row.professional_body,
    category: row.category,
    deadlineDate: row.deadline_date,
    description: row.description,
    sourceUrl: row.source_url,
    publishedArticleId: row.published_article_id,
  };
}

function toPipelineJob(row: PipelineJobRow): PipelineJob {
  return {
    id: row.id,
    rawNewsItemId: row.raw_news_item_id,
    storyId: row.story_id,
    stage: row.stage as PipelineJob['stage'],
    attempts: row.attempts,
    errorMessage: row.error_message,
    lastAdvancedAt: row.last_advanced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEditorialReview(row: EditorialReviewRow): EditorialReview {
  return {
    id: row.id,
    articleDraftId: row.article_draft_id,
    verificationPassed: row.verification_passed,
    claimChecks: row.claim_checks,
    riskLevel: row.risk_level as EditorialReview['riskLevel'],
    riskReasons: row.risk_reasons,
    reviewDecision: row.review_decision as EditorialReview['reviewDecision'],
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

// ---------- Source registry ----------

export async function createSource(input: CreateNewsSourceInput): Promise<NewsSource> {
  const staff = await usersService.requireRole([...EDITORIAL_ROLES]);
  const parsed = createNewsSourceInputSchema.parse(input);
  const row = await newsRepository.insertNewsSource(parsed, staff.id);
  return toNewsSource(row);
}

export async function listSources(): Promise<NewsSource[]> {
  await usersService.requireRole([...EDITORIAL_ROLES]);
  const rows = await newsRepository.selectNewsSources();
  return rows.map(toNewsSource);
}

export async function updateSource(id: string, input: UpdateNewsSourceInput): Promise<NewsSource> {
  await usersService.requireRole([...EDITORIAL_ROLES]);
  const parsed = updateNewsSourceInputSchema.parse(input);
  const existing = await newsRepository.selectNewsSourceById(id);
  if (!existing) throw new AppError('NOT_FOUND', 'Source not found.', 404);
  const changes: Partial<NewsSourceRow> = {};
  if (parsed.name !== undefined) changes.name = parsed.name;
  if (parsed.status !== undefined) changes.status = parsed.status;
  if (parsed.reliabilityScore !== undefined) changes.reliability_score = parsed.reliabilityScore;
  if (parsed.tier !== undefined) changes.tier = parsed.tier;
  const row = await newsRepository.updateNewsSource(id, changes);
  return toNewsSource(row);
}

// ---------- Pipeline visibility (Editorial Dashboard) ----------

export async function listPipelineJobs(): Promise<PipelineJob[]> {
  await usersService.requireRole([...EDITORIAL_ROLES]);
  const rows = await newsRepository.selectAllPipelineJobs();
  return rows.map(toPipelineJob);
}

export async function listPendingReviews(): Promise<
  { review: EditorialReview; draft: ArticleDraftRow; story: Story }[]
> {
  await usersService.requireRole([...EDITORIAL_ROLES]);
  const rows = await newsRepository.selectPendingLevel2Reviews();
  return rows.map((row) => ({
    review: toEditorialReview(row),
    draft: row.article_drafts,
    story: toStory(row.article_drafts.stories),
  }));
}

export async function listRecentAgentRuns() {
  await usersService.requireRole([...EDITORIAL_ROLES]);
  return newsRepository.selectRecentAgentRuns();
}

// Section 10 cost model — makes real spend visible instead of estimated.
export async function getCostSummary(sinceDays = 30) {
  await usersService.requireRole([...EDITORIAL_ROLES]);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = await newsRepository.selectCostSummarySince(since);
  const byAgent: Record<string, { tokensIn: number; tokensOut: number; estimatedCostUsd: number; calls: number }> = {};
  let totalCostUsd = 0;
  for (const row of rows) {
    const key = row.agent_name;
    if (!byAgent[key]) byAgent[key] = { tokensIn: 0, tokensOut: 0, estimatedCostUsd: 0, calls: 0 };
    byAgent[key].tokensIn += row.tokens_in ?? 0;
    byAgent[key].tokensOut += row.tokens_out ?? 0;
    byAgent[key].estimatedCostUsd += row.estimated_cost_usd ?? 0;
    byAgent[key].calls += 1;
    totalCostUsd += row.estimated_cost_usd ?? 0;
  }
  return { sinceDays, totalCostUsd, byAgent };
}

// ---------- Level 2 human review (doc Section 5 escalation) ----------

// Reviewing a story that already left Level 2 (someone else beat you to it,
// or it was re-routed) is a real race in a two-tab-open staff workflow —
// this is the guard, not a redundant check.
export async function submitReview(reviewId: string, input: SubmitReviewInput): Promise<EditorialReview> {
  const staff = await usersService.requireRole([...EDITORIAL_ROLES]);
  const parsed = submitReviewInputSchema.parse(input);

  const existing = await newsRepository.selectEditorialReviewById(reviewId);
  if (!existing) throw new AppError('NOT_FOUND', 'Review not found.', 404);
  if (existing.review_decision !== null) {
    throw new AppError('ALREADY_REVIEWED', 'This review has already been decided.', 409);
  }

  const draft = await newsRepository.selectArticleDraftById(existing.article_draft_id);
  if (!draft) throw new AppError('NOT_FOUND', 'Draft not found.', 404);

  const updated = await newsRepository.updateEditorialReview(reviewId, {
    review_decision: parsed.decision,
    review_note: parsed.reviewNote ?? null,
    reviewed_by: staff.id,
    reviewed_at: new Date().toISOString(),
  });

  const job = await newsRepository.selectPipelineJobByStoryId(draft.story_id);

  if (parsed.decision === 'rejected') {
    await newsRepository.updateStory(draft.story_id, { status: 'blocked' });
    if (job) await newsRepository.updatePipelineJob(job.id, { stage: 'blocked' });
    return toEditorialReview(updated);
  }

  // approved or edited — publish now, using the human's edits if supplied.
  const { publishStoryFromDraft } = await import('@/modules/news-insights/pipeline/publishing');
  await publishStoryFromDraft({
    story: await getStoryOrThrow(draft.story_id),
    draft,
    riskLevel: (existing.risk_level ?? 2) as 1 | 2 | 3,
    verificationPassed: existing.verification_passed ?? false,
    overrides:
      parsed.decision === 'edited'
        ? { headline: parsed.editedHeadline, summary: parsed.editedSummary, sections: parsed.editedSections }
        : undefined,
    humanReviewed: true,
  });
  if (job) await newsRepository.updatePipelineJob(job.id, { stage: 'published' });

  return toEditorialReview(updated);
}

async function getStoryOrThrow(id: string): Promise<Story> {
  const row = await newsRepository.selectStoryById(id);
  if (!row) throw new AppError('NOT_FOUND', 'Story not found.', 404);
  return toStory(row);
}

// ---------- Public reads ----------

export async function listPublishedArticles(filters: ListPublishedArticlesFilters): Promise<PublishedArticle[]> {
  const rows = await newsRepository.selectPublishedArticles(filters);
  return rows.map(toPublishedArticle);
}

export async function getPublishedArticleBySlug(slug: string): Promise<PublishedArticle> {
  const row = await newsRepository.selectPublishedArticleBySlug(slug);
  if (!row) throw new AppError('NOT_FOUND', 'Article not found.', 404);
  await newsRepository.incrementArticleViewCount(row.id).catch(() => undefined);
  return toPublishedArticle(row);
}

export async function listUpcomingDeadlines(limit = 20): Promise<Deadline[]> {
  const rows = await newsRepository.selectUpcomingDeadlines(limit);
  return rows.map(toDeadline);
}

// ---------- Corrections ----------

export async function addCorrection(articleId: string, input: CreateCorrectionInput): Promise<void> {
  const staff = await usersService.requireRole([...EDITORIAL_ROLES]);
  const article = await newsRepository.selectPublishedArticleById(articleId);
  if (!article) throw new AppError('NOT_FOUND', 'Article not found.', 404);

  await newsRepository.insertCorrection({
    published_article_id: articleId,
    correction_text: input.correctionText,
    corrected_by: staff.id,
  });

  const labels = article.transparency_labels.includes('Correction issued')
    ? article.transparency_labels
    : [...article.transparency_labels, 'Correction issued'];
  await newsRepository.updatePublishedArticle(articleId, {
    transparency_labels: labels,
    last_corrected_at: new Date().toISOString(),
  });
}

// ---------- Retention (doc Section 12 item 2 — placeholder, see migration) ----------

const RAW_TEXT_RETENTION_DAYS = 30;

export async function purgeStaleRawText(): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - RAW_TEXT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const purged = await newsRepository.purgeOldRawText(cutoff);
  return { purged };
}
