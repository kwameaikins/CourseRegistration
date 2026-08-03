import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { AgentRunLogEntry, CreateNewsSourceInput, ListPublishedArticlesFilters } from '@/modules/news-insights/types';

type NewsSourceRow = Database['public']['Tables']['news_sources']['Row'];
type RawNewsItemRow = Database['public']['Tables']['raw_news_items']['Row'];
type StoryRow = Database['public']['Tables']['stories']['Row'];
type ArticleDraftRow = Database['public']['Tables']['article_drafts']['Row'];
type EditorialReviewRow = Database['public']['Tables']['editorial_reviews']['Row'];
type PublishedArticleRow = Database['public']['Tables']['published_articles']['Row'];
type DeadlineRow = Database['public']['Tables']['deadlines']['Row'];
type PipelineJobRow = Database['public']['Tables']['pipeline_jobs']['Row'];
type CorrectionRow = Database['public']['Tables']['corrections_log']['Row'];

// ---------- news_sources ----------

export async function insertNewsSource(
  input: CreateNewsSourceInput,
  createdBy: string,
): Promise<NewsSourceRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('news_sources')
    .insert({
      name: input.name,
      source_url: input.sourceUrl,
      source_type: input.sourceType,
      tier: input.tier,
      default_category: input.defaultCategory ?? null,
      reliability_score: input.reliabilityScore,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectNewsSources(): Promise<NewsSourceRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('news_sources').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectActiveNewsSources(): Promise<NewsSourceRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('news_sources').select('*').eq('status', 'active');
  if (error) throw error;
  return data ?? [];
}

export async function selectNewsSourceById(id: string): Promise<NewsSourceRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('news_sources').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateNewsSource(id: string, changes: Partial<NewsSourceRow>): Promise<NewsSourceRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('news_sources')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- raw_news_items ----------

export async function insertRawNewsItem(input: {
  source_id: string;
  external_url: string | null;
  content_hash: string;
  title: string;
  raw_text: string | null;
  published_at: string | null;
}): Promise<RawNewsItemRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  // Exact-match dedup (doc Section 10 cost control): a conflicting hash is
  // silently skipped, never an error — the same item collected twice from
  // overlapping sources is expected, not exceptional.
  const { data, error } = await supabase
    .from('raw_news_items')
    .insert(input)
    .select()
    .maybeSingle();
  if (error && !error.message.includes('duplicate key')) throw error;
  return data;
}

export async function selectRawNewsItemsByStatus(status: RawNewsItemRow['status'], limit: number): Promise<RawNewsItemRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('raw_news_items')
    .select('*')
    .eq('status', status)
    .order('collected_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function selectRawNewsItemById(id: string): Promise<RawNewsItemRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('raw_news_items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Near-duplicate check via pg_trgm title similarity (no embeddings provider
// configured — see migration header). Threshold 0.45 empirically reasonable
// for news-headline near-duplicates; tune once real volume exists.
export async function selectSimilarRecentTitles(title: string, sinceIso: string): Promise<{ id: string; title: string }[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc('fn_news_similar_titles', {
    p_title: title,
    p_since: sinceIso,
  });
  if (error) throw error;
  return (data ?? []) as { id: string; title: string }[];
}

export async function updateRawNewsItem(id: string, changes: Partial<RawNewsItemRow>): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('raw_news_items').update(changes).eq('id', id);
  if (error) throw error;
}

export async function purgeOldRawText(olderThanIso: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('raw_news_items')
    .update({ raw_text: null, raw_text_purged_at: new Date().toISOString() })
    .lt('collected_at', olderThanIso)
    .is('raw_text_purged_at', null)
    .not('raw_text', 'is', null)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// ---------- stories / story_sources ----------

export async function insertStory(input: Partial<StoryRow> & { canonical_title: string; category: string }): Promise<StoryRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('stories').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function selectStoryIdForRawNewsItem(rawNewsItemId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('story_sources')
    .select('story_id')
    .eq('raw_news_item_id', rawNewsItemId)
    .maybeSingle();
  if (error) throw error;
  return data?.story_id ?? null;
}

export async function linkStorySource(storyId: string, rawNewsItemId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('story_sources')
    .insert({ story_id: storyId, raw_news_item_id: rawNewsItemId });
  if (error && !error.message.includes('duplicate key')) throw error;
}

export async function selectStoryById(id: string): Promise<StoryRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('stories').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateStory(id: string, changes: Partial<StoryRow>): Promise<StoryRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('stories')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectStorySourceUrls(storyId: string): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('story_sources')
    .select('raw_news_items(external_url)')
    .eq('story_id', storyId);
  if (error) throw error;
  return (data ?? [])
    .map((row) => (row.raw_news_items as unknown as { external_url: string | null } | null)?.external_url)
    .filter((url): url is string => !!url);
}

export async function selectStoryRawText(storyId: string): Promise<{ title: string; rawText: string | null; externalUrl: string | null }[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('story_sources')
    .select('raw_news_items(title, raw_text, external_url)')
    .eq('story_id', storyId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const item = row.raw_news_items as unknown as { title: string; raw_text: string | null; external_url: string | null };
    return { title: item.title, rawText: item.raw_text, externalUrl: item.external_url };
  });
}

// ---------- article_drafts ----------

export async function insertArticleDraft(input: Omit<Database['public']['Tables']['article_drafts']['Insert'], 'id' | 'created_at'>): Promise<ArticleDraftRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('article_drafts').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function selectLatestDraftForStory(storyId: string): Promise<ArticleDraftRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('article_drafts')
    .select('*')
    .eq('story_id', storyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectArticleDraftById(id: string): Promise<ArticleDraftRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('article_drafts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- editorial_reviews ----------

export async function insertEditorialReview(
  input: Omit<Database['public']['Tables']['editorial_reviews']['Insert'], 'id' | 'created_at'>,
): Promise<EditorialReviewRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('editorial_reviews').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function selectEditorialReviewById(id: string): Promise<EditorialReviewRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('editorial_reviews').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectPendingLevel2Reviews(): Promise<
  (EditorialReviewRow & { article_drafts: ArticleDraftRow & { stories: StoryRow } })[]
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('editorial_reviews')
    .select('*, article_drafts(*, stories(*))')
    .eq('risk_level', 2)
    .is('review_decision', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (EditorialReviewRow & { article_drafts: ArticleDraftRow & { stories: StoryRow } })[];
}

export async function selectEditorialReviewByDraftId(draftId: string): Promise<EditorialReviewRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('editorial_reviews')
    .select('*')
    .eq('article_draft_id', draftId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateEditorialReview(id: string, changes: Partial<EditorialReviewRow>): Promise<EditorialReviewRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('editorial_reviews').update(changes).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ---------- published_articles ----------

export async function insertPublishedArticle(
  input: Omit<Database['public']['Tables']['published_articles']['Insert'], 'id'>,
): Promise<PublishedArticleRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('published_articles').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function selectPublishedArticleBySlug(slug: string): Promise<PublishedArticleRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('published_articles').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectPublishedArticleById(id: string): Promise<PublishedArticleRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('published_articles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectPublishedArticles(filters: ListPublishedArticlesFilters): Promise<PublishedArticleRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase.from('published_articles').select('*');
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`headline.ilike.${term},summary.ilike.${term}`);
  }
  const { data, error } = await query.order('published_at', { ascending: false }).limit(filters.limit);
  if (error) throw error;
  return data ?? [];
}

export async function incrementArticleViewCount(id: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.rpc('fn_news_increment_view_count', { p_article_id: id });
  if (error) throw error;
}

export async function updatePublishedArticle(id: string, changes: Partial<PublishedArticleRow>): Promise<PublishedArticleRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('published_articles')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- deadlines ----------

export async function selectUpcomingDeadlines(limit: number): Promise<DeadlineRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('deadlines')
    .select('*')
    .gte('deadline_date', new Date().toISOString().slice(0, 10))
    .order('deadline_date', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------- corrections_log ----------

export async function insertCorrection(input: { published_article_id: string; correction_text: string; corrected_by: string }): Promise<CorrectionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('corrections_log').insert(input).select().single();
  if (error) throw error;
  return data;
}

// ---------- pipeline_jobs ----------

export async function insertPipelineJob(input: { raw_news_item_id?: string | null; story_id?: string | null; stage?: string }): Promise<PipelineJobRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('pipeline_jobs').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function selectPipelineJobsByStage(stage: string, limit: number): Promise<PipelineJobRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('pipeline_jobs')
    .select('*')
    .eq('stage', stage)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function selectPipelineJobById(id: string): Promise<PipelineJobRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('pipeline_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectPipelineJobByRawNewsItemId(rawNewsItemId: string): Promise<PipelineJobRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('pipeline_jobs')
    .select('*')
    .eq('raw_news_item_id', rawNewsItemId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectPipelineJobByStoryId(storyId: string): Promise<PipelineJobRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('pipeline_jobs')
    .select('*')
    .eq('story_id', storyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectAllPipelineJobs(limit = 300): Promise<PipelineJobRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('pipeline_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function updatePipelineJob(id: string, changes: Partial<PipelineJobRow>): Promise<PipelineJobRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('pipeline_jobs')
    .update({ ...changes, updated_at: new Date().toISOString(), last_advanced_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- agent_run_log ----------

export async function insertAgentRunLog(entry: AgentRunLogEntry): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('agent_run_log').insert({
    pipeline_job_id: entry.pipelineJobId ?? null,
    agent_name: entry.agentName,
    model: entry.model,
    input_ref: entry.inputRef ?? null,
    output_summary: entry.outputSummary ?? null,
    confidence: entry.confidence ?? null,
    tokens_in: entry.tokensIn ?? null,
    tokens_out: entry.tokensOut ?? null,
    estimated_cost_usd: entry.estimatedCostUsd ?? null,
    duration_ms: entry.durationMs ?? null,
    success: entry.success,
    error_message: entry.errorMessage ?? null,
  });
  if (error) throw error;
}

export async function selectRecentAgentRuns(limit = 100): Promise<Database['public']['Tables']['agent_run_log']['Row'][]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('agent_run_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function selectCostSummarySince(sinceIso: string): Promise<{ agent_name: string; tokens_in: number | null; tokens_out: number | null; estimated_cost_usd: number | null }[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('agent_run_log')
    .select('agent_name, tokens_in, tokens_out, estimated_cost_usd')
    .gte('created_at', sinceIso);
  if (error) throw error;
  return data ?? [];
}
