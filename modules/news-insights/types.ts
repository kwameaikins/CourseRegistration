import { z } from 'zod';

// Canonical taxonomy (Coding Docs/Knowsia_Insights_Agentic_News_Refined.md,
// Section 2). Single source of truth — every screen and every DB CHECK
// constraint (migration 202608020046_news_insights.sql) must match this
// list exactly, never restate it independently.
export const NEWS_CATEGORIES = [
  'Business & Economy',
  'Finance & Markets',
  'Accounting, Audit & Reporting',
  'Professional Bodies',
  'Technology & AI',
  'Start-ups & Entrepreneurship',
  'Careers, Education & CPD',
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

// URL-safe category slugs (category names contain commas/ampersands) —
// used by the public /news/[category] route.
export function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function slugToCategory(slug: string): NewsCategory | undefined {
  return NEWS_CATEGORIES.find((category) => categoryToSlug(category) === slug);
}

export const NEWS_GEOGRAPHIES = ['Ghana', 'West Africa', 'Africa', 'UK', 'US', 'Europe', 'Asia', 'Global'] as const;

export const NEWS_AUDIENCES = [
  'Accountants',
  'Auditors',
  'Finance Executives',
  'Business Owners',
  'Entrepreneurs',
  'Students',
  'Technology Professionals',
  'Internal Auditors',
  'Tax Professionals',
  'Sustainability Professionals',
  'Corporate Leaders',
] as const;

export const NEWS_CONTENT_TYPES = [
  'News',
  'Explainer',
  'Analysis',
  'Professional Announcement',
  'Standard Update',
  'Examination Update',
  'Event',
  'Opportunity',
  'Research',
  'Interview',
  'Opinion',
  'Weekly Briefing',
] as const;

export const NEWS_IMPORTANCE_LEVELS = [
  'Breaking',
  'Important',
  'Developing',
  'Routine Update',
  'Deadline Approaching',
] as const;

// Section 2.3 — professional bodies tracked. AICPA & CIMA is one combined
// brand (2017 merger) tracked as a single entity here.
export const TRACKED_PROFESSIONAL_BODIES = [
  'ICAG',
  'ACCA',
  'AICPA & CIMA',
  'ICAN',
  'IFAC',
  'PAFA',
  'IIA',
  'CFA Institute',
  'CIPFA',
  'ICAEW',
  'ISACA',
  'PMI',
  'SHRM',
  'Chartered Institute of Bankers',
  'Chartered Institute of Taxation',
] as const;

// Doc Section 7 — never label an article "verified" unless the Verification
// Agent's independent pass actually ran and passed (enforced in
// pipeline/publishing.ts, not just documented here).
export const TRANSPARENCY_LABELS = [
  'Official announcement',
  'AI-researched',
  'Human-reviewed',
  'Multiple sources verified',
  'Developing story',
  'Analysis',
  'Opinion',
  'Correction issued',
  'Sponsored',
] as const;

export const PIPELINE_STAGES = [
  'collected',
  'triaged',
  'researched',
  'verified',
  'routed',
  'published',
  'monitoring',
  'review',
  'blocked',
  'error',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const AGENT_NAMES = [
  'source_collection',
  'triage',
  'research_drafting',
  'verification',
  'editorial_risk',
  'publishing',
  'monitoring',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export interface NewsSource {
  id: string;
  name: string;
  sourceUrl: string;
  sourceType: 'rss' | 'html' | 'manual';
  tier: 1 | 2 | 3 | 4;
  defaultCategory: NewsCategory | null;
  reliabilityScore: number;
  status: 'active' | 'disabled';
  lastFetchedAt: string | null;
  lastFetchError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createNewsSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sourceUrl: z.string().trim().url(),
  sourceType: z.enum(['rss', 'html', 'manual']).default('rss'),
  tier: z.number().int().min(1).max(4),
  defaultCategory: z.enum(NEWS_CATEGORIES).nullable().optional(),
  reliabilityScore: z.number().min(0).max(100).default(70),
});
export type CreateNewsSourceInput = z.infer<typeof createNewsSourceInputSchema>;

export const updateNewsSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  reliabilityScore: z.number().min(0).max(100).optional(),
  tier: z.number().int().min(1).max(4).optional(),
});
export type UpdateNewsSourceInput = z.infer<typeof updateNewsSourceInputSchema>;

export interface RawNewsItem {
  id: string;
  sourceId: string;
  externalUrl: string | null;
  contentHash: string;
  title: string;
  rawText: string | null;
  publishedAt: string | null;
  collectedAt: string;
  status: 'pending' | 'triaged' | 'duplicate' | 'discarded';
}

export interface Story {
  id: string;
  canonicalTitle: string;
  category: NewsCategory;
  subcategories: string[];
  geography: string[];
  audience: string[];
  contentType: string | null;
  importance: string | null;
  status: 'open' | 'researching' | 'ready' | 'published' | 'blocked';
  createdAt: string;
  updatedAt: string;
}

export interface ArticleDraft {
  id: string;
  storyId: string;
  researchNote: string | null;
  draftHeadline: string | null;
  draftSummary: string | null;
  draftSections: ArticleSections | null;
  modelUsed: string;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

// Doc Section 14 article body structure.
export interface ArticleSections {
  whatHappened: string;
  whyItMatters: string;
  whoIsAffected: string;
  keyDetails: string;
  whatShouldYouDo: string;
  knowsiaAnalysis: string;
}

export interface EditorialReview {
  id: string;
  articleDraftId: string;
  verificationPassed: boolean | null;
  claimChecks: unknown;
  riskLevel: 1 | 2 | 3 | null;
  riskReasons: string[];
  reviewDecision: 'approved' | 'edited' | 'rejected' | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export const submitReviewInputSchema = z.object({
  decision: z.enum(['approved', 'edited', 'rejected']),
  reviewNote: z.string().trim().max(2000).nullable().optional(),
  editedHeadline: z.string().trim().min(1).max(300).optional(),
  editedSummary: z.string().trim().min(1).max(1000).optional(),
  editedSections: z
    .object({
      whatHappened: z.string(),
      whyItMatters: z.string(),
      whoIsAffected: z.string(),
      keyDetails: z.string(),
      whatShouldYouDo: z.string(),
      knowsiaAnalysis: z.string(),
    })
    .optional(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

export interface PublishedArticle {
  id: string;
  storyId: string | null;
  slug: string;
  headline: string;
  summary: string;
  sections: ArticleSections;
  category: NewsCategory;
  subcategories: string[];
  geography: string[];
  audience: string[];
  contentType: string | null;
  importance: string | null;
  transparencyLabels: string[];
  riskLevel: 1 | 2 | 3 | null;
  sourceUrls: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  imageUrl: string | null;
  viewCount: number;
  publishedAt: string;
  updatedAt: string;
  lastCorrectedAt: string | null;
}

export const listPublishedArticlesFiltersSchema = z.object({
  category: z.enum(NEWS_CATEGORIES).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export type ListPublishedArticlesFilters = z.infer<typeof listPublishedArticlesFiltersSchema>;

export interface Deadline {
  id: string;
  title: string;
  professionalBody: string | null;
  category: string | null;
  deadlineDate: string;
  description: string | null;
  sourceUrl: string | null;
  publishedArticleId: string | null;
}

export const createCorrectionInputSchema = z.object({
  correctionText: z.string().trim().min(1).max(2000),
});
export type CreateCorrectionInput = z.infer<typeof createCorrectionInputSchema>;

export interface PipelineJob {
  id: string;
  rawNewsItemId: string | null;
  storyId: string | null;
  stage: PipelineStage;
  attempts: number;
  errorMessage: string | null;
  lastAdvancedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunLogEntry {
  agentName: AgentName;
  model: string;
  inputRef?: string | null;
  outputSummary?: string | null;
  confidence?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  estimatedCostUsd?: number | null;
  durationMs?: number | null;
  success: boolean;
  errorMessage?: string | null;
  pipelineJobId?: string | null;
}
