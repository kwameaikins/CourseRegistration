-- Knowsia Insights (m11-news-insights), founder-requested 2026-08-02, per
-- Coding Docs/Knowsia_Insights_Agentic_News_Refined.md and Coding Docs/
-- 17_News_Insights_Operations.md. An AI-agent pipeline (source collection ->
-- triage -> research/drafting -> independent verification -> editorial risk
-- routing -> publishing -> monitoring) that produces original news/analysis
-- for Knowsia's accounting/finance audience, plus the staff Editorial
-- Dashboard and public news site around it.
--
-- Deviation from the source doc worth recording here: Section 8.3 proposed
-- pgvector + embeddings for semantic dedup. This project has no embeddings
-- provider configured (Anthropic doesn't offer one; adding a second vendor,
-- e.g. Voyage AI, is a new paid service requiring the same founder sign-off
-- as every other paid integration in CLAUDE.md, and wasn't asked). Dedup
-- here instead uses exact content_hash matching (the doc's own primary cost
-- control) plus pg_trgm fuzzy title similarity for near-duplicates — both
-- built into Postgres, zero new vendors, sufficient at this volume (PX.02).
-- content_embeddings/pgvector can be added later if/when an embeddings
-- provider is approved, without disturbing anything built here.
begin;

create extension if not exists pg_trgm;

-- =========================================================
-- news_sources — the registry staff populate with real source URLs via the
-- Editorial Dashboard. Deliberately seeded with zero rows by this migration:
-- fabricating source URLs is not something to do without verification, and
-- until at least one active source exists the pipeline has nothing to
-- collect (same "dormant until configured" posture as WhatsApp/SMS).
-- =========================================================
create table public.news_sources (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    source_url        text not null,
    source_type       text not null default 'rss' check (source_type in ('rss', 'html', 'manual')),
    -- Four-tier trust model (doc Section 6): 1 Primary Official Sources,
    -- 2 Established News Organisations, 3 Specialist Publications,
    -- 4 Social Media/Community.
    tier              integer not null check (tier between 1 and 4),
    default_category  text,
    reliability_score numeric(4,1) not null default 70.0 check (reliability_score between 0 and 100),
    status            text not null default 'active' check (status in ('active', 'disabled')),
    last_fetched_at   timestamptz,
    last_fetch_error  text,
    created_by        uuid references public.staff_users(id) on delete set null,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

comment on table public.news_sources is
    'Registry of real, staff-added news sources (RSS/HTML feeds). No rows are pre-seeded.';
comment on column public.news_sources.reliability_score is
    'Reviewed periodically, not set once at onboarding (doc Section 6 — score decay). A source with recent corrections should have this adjusted before its next story is trusted at the same level.';

-- =========================================================
-- raw_news_items — one row per item ingested from a source.
-- =========================================================
create table public.raw_news_items (
    id                 uuid primary key default gen_random_uuid(),
    source_id          uuid not null references public.news_sources(id) on delete cascade,
    external_url       text,
    -- Exact-match dedup / cost control (doc Section 10) — prevents
    -- reprocessing the same item collected twice or from two sources with
    -- identical content.
    content_hash       text not null unique,
    title              text not null,
    raw_text           text,
    -- TODO(founder/legal): confirm final retention window (Section 12 item
    -- 2 of the source doc — copyright exposure vs. re-verification ability).
    -- Placeholder shipped: 30 days, then raw_text is purged (set null) by
    -- the pipeline cron, keeping only title/url/hash/citation.
    raw_text_purged_at timestamptz,
    published_at       timestamptz,
    collected_at       timestamptz not null default now(),
    status             text not null default 'pending' check (status in ('pending', 'triaged', 'duplicate', 'discarded')),
    created_at         timestamptz not null default now()
);

comment on table public.raw_news_items is
    'One scraped/fetched item per source. raw_text is purged after 30 days (placeholder retention, pending founder/legal sign-off) — citation/hash survive indefinitely.';

create index raw_news_items_source_idx on public.raw_news_items (source_id);
create index raw_news_items_status_idx on public.raw_news_items (status);
create index raw_news_items_title_trgm_idx on public.raw_news_items using gin (title gin_trgm_ops);

-- =========================================================
-- stories — a triaged, deduplicated cluster of one or more raw items.
-- =========================================================
create table public.stories (
    id              uuid primary key default gen_random_uuid(),
    canonical_title text not null,
    category        text not null check (category in (
                        'Business & Economy', 'Finance & Markets', 'Accounting, Audit & Reporting',
                        'Professional Bodies', 'Technology & AI', 'Start-ups & Entrepreneurship',
                        'Careers, Education & CPD'
                    )),
    subcategories   text[] not null default '{}',
    geography       text[] not null default '{}',
    audience        text[] not null default '{}',
    content_type    text check (content_type in (
                        'News', 'Explainer', 'Analysis', 'Professional Announcement', 'Standard Update',
                        'Examination Update', 'Event', 'Opportunity', 'Research', 'Interview', 'Opinion',
                        'Weekly Briefing'
                    )),
    importance      text check (importance in (
                        'Breaking', 'Important', 'Developing', 'Routine Update', 'Deadline Approaching'
                    )),
    status          text not null default 'open' check (status in ('open', 'researching', 'ready', 'published', 'blocked')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index stories_category_idx on public.stories (category);
create index stories_status_idx on public.stories (status);

-- Many raw items can cluster into one story (Triage Agent's dedup pass).
create table public.story_sources (
    id                uuid primary key default gen_random_uuid(),
    story_id          uuid not null references public.stories(id) on delete cascade,
    raw_news_item_id  uuid not null references public.raw_news_items(id) on delete cascade,
    created_at        timestamptz not null default now(),
    unique (story_id, raw_news_item_id)
);

-- =========================================================
-- article_drafts — Research & Drafting Agent output.
-- =========================================================
create table public.article_drafts (
    id             uuid primary key default gen_random_uuid(),
    story_id       uuid not null references public.stories(id) on delete cascade,
    research_note  text,
    draft_headline text,
    draft_summary  text,
    -- Structured sections per doc Section 14: whatHappened, whyItMatters,
    -- whoIsAffected, keyDetails, whatShouldYouDo, knowsiaAnalysis.
    draft_sections jsonb,
    model_used     text not null,
    tokens_in      integer,
    tokens_out     integer,
    created_at     timestamptz not null default now()
);

create index article_drafts_story_idx on public.article_drafts (story_id);

-- =========================================================
-- editorial_reviews — Verification Agent + Editorial Risk & Routing Agent
-- output, and the human Level 2 review decision. One independent pass,
-- never sharing context with the draft it's checking (doc Section 4 — the
-- one rule in the whole architecture that must not be violated).
-- =========================================================
create table public.editorial_reviews (
    id                    uuid primary key default gen_random_uuid(),
    article_draft_id      uuid not null references public.article_drafts(id) on delete cascade,
    verification_passed   boolean,
    claim_checks          jsonb,
    risk_level            integer check (risk_level in (1, 2, 3)),
    risk_reasons          text[] not null default '{}',
    review_decision        text check (review_decision in ('approved', 'edited', 'rejected')),
    review_note           text,
    reviewed_by           uuid references public.staff_users(id) on delete set null,
    reviewed_at           timestamptz,
    created_at            timestamptz not null default now()
);

create index editorial_reviews_draft_idx on public.editorial_reviews (article_draft_id);
create index editorial_reviews_pending_idx on public.editorial_reviews (risk_level) where review_decision is null;

-- =========================================================
-- published_articles — Publishing Agent output, the public-facing record.
-- =========================================================
create table public.published_articles (
    id                  uuid primary key default gen_random_uuid(),
    story_id            uuid references public.stories(id) on delete set null,
    slug                text not null unique,
    headline            text not null,
    summary             text not null,
    sections            jsonb not null,
    category            text not null check (category in (
                            'Business & Economy', 'Finance & Markets', 'Accounting, Audit & Reporting',
                            'Professional Bodies', 'Technology & AI', 'Start-ups & Entrepreneurship',
                            'Careers, Education & CPD'
                        )),
    subcategories       text[] not null default '{}',
    geography           text[] not null default '{}',
    audience            text[] not null default '{}',
    content_type        text,
    importance          text,
    -- Doc Section 7: Official announcement, AI-researched, Human-reviewed,
    -- Multiple sources verified, Developing story, Analysis, Opinion,
    -- Correction issued, Sponsored. "Verified" only ever appears here when
    -- the Verification Agent's independent pass actually ran and passed.
    transparency_labels text[] not null default '{}',
    risk_level          integer check (risk_level in (1, 2, 3)),
    source_urls         text[] not null default '{}',
    seo_title           text,
    seo_description     text,
    image_url           text,
    view_count          integer not null default 0,
    published_at        timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    last_corrected_at   timestamptz
);

comment on column public.published_articles.sections is
    'Doc Section 14 structure as JSON keys: whatHappened, whyItMatters, whoIsAffected, keyDetails, whatShouldYouDo, knowsiaAnalysis.';

create index published_articles_category_idx on public.published_articles (category);
create index published_articles_published_at_idx on public.published_articles (published_at desc);

-- =========================================================
-- deadlines — Upcoming Deadlines homepage section + professional-body
-- tracked activity (doc Section 2.3 / Section 13 Section 7).
-- =========================================================
create table public.deadlines (
    id               uuid primary key default gen_random_uuid(),
    title            text not null,
    professional_body text,
    category         text,
    deadline_date    date not null,
    description      text,
    source_url       text,
    published_article_id uuid references public.published_articles(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index deadlines_date_idx on public.deadlines (deadline_date);

-- =========================================================
-- corrections_log — Monitoring & Update Agent + staff-issued corrections.
-- =========================================================
create table public.corrections_log (
    id                     uuid primary key default gen_random_uuid(),
    published_article_id   uuid not null references public.published_articles(id) on delete cascade,
    correction_text        text not null,
    corrected_by           uuid references public.staff_users(id) on delete set null,
    created_at             timestamptz not null default now()
);

create index corrections_log_article_idx on public.corrections_log (published_article_id);

-- =========================================================
-- pipeline_jobs — the status-column backbone (doc Section 8.2) advanced by
-- the cron route instead of a message queue. One row per raw item as it
-- moves through collection/triage, then re-pointed at the resulting story
-- once one exists.
-- =========================================================
create table public.pipeline_jobs (
    id                 uuid primary key default gen_random_uuid(),
    raw_news_item_id   uuid references public.raw_news_items(id) on delete cascade,
    story_id           uuid references public.stories(id) on delete cascade,
    stage              text not null default 'collected' check (stage in (
                            'collected', 'triaged', 'researched', 'verified', 'routed',
                            'published', 'monitoring', 'review', 'blocked', 'error'
                        )),
    attempts           integer not null default 0,
    error_message      text,
    last_advanced_at   timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    constraint pipeline_jobs_has_a_subject check (raw_news_item_id is not null or story_id is not null)
);

create index pipeline_jobs_stage_idx on public.pipeline_jobs (stage);
create index pipeline_jobs_story_idx on public.pipeline_jobs (story_id);

-- =========================================================
-- agent_run_log — one row per agent invocation. Makes the cost model (doc
-- Section 10) measurable from day one instead of estimated, and is the
-- audit trail if a published article is later found to be wrong.
-- =========================================================
create table public.agent_run_log (
    id                  uuid primary key default gen_random_uuid(),
    pipeline_job_id     uuid references public.pipeline_jobs(id) on delete set null,
    agent_name          text not null,
    model               text not null,
    input_ref           text,
    output_summary      text,
    confidence          numeric(4,3),
    tokens_in           integer,
    tokens_out          integer,
    estimated_cost_usd  numeric(10,6),
    duration_ms         integer,
    success             boolean not null default true,
    error_message       text,
    created_at          timestamptz not null default now()
);

create index agent_run_log_job_idx on public.agent_run_log (pipeline_job_id);
create index agent_run_log_created_idx on public.agent_run_log (created_at desc);
create index agent_run_log_agent_idx on public.agent_run_log (agent_name);

-- =========================================================
-- RLS — admin+marketing manage the editorial pipeline (same roles as
-- leads/campaigns/partners); published_articles and deadlines additionally
-- get a public-read policy since that content is legitimately public.
-- =========================================================
alter table public.news_sources enable row level security;
alter table public.raw_news_items enable row level security;
alter table public.stories enable row level security;
alter table public.story_sources enable row level security;
alter table public.article_drafts enable row level security;
alter table public.editorial_reviews enable row level security;
alter table public.published_articles enable row level security;
alter table public.deadlines enable row level security;
alter table public.corrections_log enable row level security;
alter table public.pipeline_jobs enable row level security;
alter table public.agent_run_log enable row level security;

create policy admin_marketing_full_news_sources on public.news_sources for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_raw_news_items on public.raw_news_items for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_stories on public.stories for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_story_sources on public.story_sources for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_article_drafts on public.article_drafts for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_editorial_reviews on public.editorial_reviews for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_published_articles on public.published_articles for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy public_read_published_articles on public.published_articles for select to anon, authenticated
  using (true);

create policy admin_marketing_full_deadlines on public.deadlines for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy public_read_deadlines on public.deadlines for select to anon, authenticated
  using (true);

create policy admin_marketing_full_corrections_log on public.corrections_log for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_pipeline_jobs on public.pipeline_jobs for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

create policy admin_marketing_full_agent_run_log on public.agent_run_log for all to authenticated
  using (public.fn_current_role() in ('admin', 'marketing'))
  with check (public.fn_current_role() in ('admin', 'marketing'));

-- Supabase PostgREST grants (Document 3, Section 7 requirement on this
-- project). Public read tables also need an explicit anon select grant.
grant select, insert, update, delete on public.news_sources to authenticated;
grant select, insert, update, delete on public.raw_news_items to authenticated;
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.story_sources to authenticated;
grant select, insert, update, delete on public.article_drafts to authenticated;
grant select, insert, update, delete on public.editorial_reviews to authenticated;
grant select, insert, update, delete on public.published_articles to authenticated;
grant select, insert, update, delete on public.deadlines to authenticated;
grant select, insert, update, delete on public.corrections_log to authenticated;
grant select, insert, update, delete on public.pipeline_jobs to authenticated;
grant select, insert, update, delete on public.agent_run_log to authenticated;
grant select on public.published_articles to anon;
grant select on public.deadlines to anon;

-- Near-duplicate title lookup (Triage Agent dedup pass) — pg_trgm
-- similarity in place of the doc's proposed pgvector/embeddings approach
-- (see migration header). security definer + fixed search_path, same
-- posture as fn_current_role/fn_current_staff_id.
create or replace function public.fn_news_similar_titles(p_title text, p_since timestamptz)
returns table(id uuid, title text)
language sql
security definer
stable
as $$
    select r.id, r.title
    from public.raw_news_items r
    where r.collected_at >= p_since
      and similarity(r.title, p_title) > 0.45
    order by similarity(r.title, p_title) desc
    limit 10;
$$;

-- Atomic view-count increment (Publishing/public article-read path) — avoids
-- a read-then-write race under concurrent readers.
create or replace function public.fn_news_increment_view_count(p_article_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.published_articles
    set view_count = view_count + 1
    where id = p_article_id;
$$;

commit;
