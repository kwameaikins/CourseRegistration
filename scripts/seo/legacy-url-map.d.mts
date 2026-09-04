// Types for scripts/seo/legacy-url-map.mjs (plain ESM so the generator runs without a TS loader).

export type LegacyType =
  | 'post'
  | 'page'
  | 'product'
  | 'product_cat'
  | 'category'
  | 'sfwd-courses'
  | 'sfwd-lessons'
  | 'sfwd-topic'
  | 'sfwd-quiz'
  | 'ld-exam'
  | 'ld_course_category'
  | 'ld_course_tag'
  | 'unknown';

export interface MapOptions {
  studyUrl: string;
  blogImported: boolean;
  questionPagesLive: boolean;
  mediaHosted: boolean;
  courseMap?: Record<string, string>;
  questionMap?: Record<string, string>;
}

export interface Mapped {
  destination: string;
  rule: string;
}

export interface PatternRule {
  source: string;
  destination: string;
  rule: string;
}

export function normalisePath(input: unknown): string;
export function typeFromSitemapName(fileName: string): LegacyType;
export function mapLegacyPath(rawPath: string, type: LegacyType, options: MapOptions): Mapped | null;
export function patternRules(options: MapOptions): PatternRule[];
export function questionRules(options: MapOptions): PatternRule[];
export function isSafeSource(path: string): boolean;
