// Shrinkage gate for the staff-edited public course copy (2026-08-22).
//
// A save that would make the live programme page smaller than what it
// currently shows — sections with entries removed, or the same entries with
// meaningfully shorter text — must name each shrunken section in the save's
// acknowledgeShrinkage list or the server refuses it. This turns "the admin
// reviews the preview before confirming" from a hope into a rule: shrinkage
// the admin has not explicitly confirmed cannot reach the live page, whether
// the document came from the editor form or from any future caller that
// generates it (a model rewriting copy from a brief being the case this was
// designed against — a model that summarises instead of carrying text
// verbatim produces exactly the same-entries-but-shorter shape the character
// rule flags).
//
// Pure and dependency-free on purpose: the editor page runs it client-side to
// build the confirmation list before submitting, and saveCourseContent runs
// the identical check server-side as the enforcing backstop. Neither copy of
// the check can drift from the other because there is only one.
import type { CoursePublicContent } from '@/modules/courses/public-content';

export interface ShrunkenSection {
  key: string;
  label: string;
  beforeItems: number;
  afterItems: number;
  beforeChars: number;
  afterChars: number;
}

// Only the list-shaped sections are guarded. Single-line fields (tagline,
// idealFor, facilitator…) are ordinary sentence edits where "shorter" is
// usually just "better", and the page renders them unconditionally anyway —
// the risk this gate exists for is bulk content quietly disappearing.
const SECTIONS: Array<{
  key: string;
  label: string;
  items: (body: CoursePublicContent) => number;
  texts: (body: CoursePublicContent) => string[];
}> = [
  { key: 'overview', label: 'Overview', items: (b) => b.overview.length, texts: (b) => b.overview },
  {
    key: 'primaryAudience',
    label: 'Primary audience',
    items: (b) => b.primaryAudience.length,
    texts: (b) => b.primaryAudience,
  },
  {
    key: 'alsoSuitableFor',
    label: 'Also suitable for',
    items: (b) => b.alsoSuitableFor.length,
    texts: (b) => b.alsoSuitableFor,
  },
  { key: 'outcomes', label: 'Outcomes', items: (b) => b.outcomes.length, texts: (b) => b.outcomes },
  {
    key: 'curriculum',
    label: 'Curriculum',
    // Items are modules; a module that keeps its slot but loses its topics is
    // caught by the character rule instead, since the topic text is counted.
    items: (b) => b.curriculum.length,
    texts: (b) =>
      b.curriculum.flatMap((s) => [s.heading, s.title, ...s.points, s.practical ?? '']),
  },
  {
    key: 'format',
    label: 'Course format',
    items: (b) => b.format.length,
    texts: (b) => b.format.flatMap((f) => [f.label, f.value]),
  },
  {
    key: 'prerequisites',
    label: 'Prerequisites',
    items: (b) => b.prerequisites.length,
    texts: (b) => b.prerequisites,
  },
  {
    key: 'includes',
    label: 'What registration includes',
    items: (b) => b.includes.length,
    texts: (b) => b.includes,
  },
  {
    key: 'faq',
    label: 'FAQ',
    items: (b) => b.faq.length,
    texts: (b) => b.faq.flatMap((f) => [f.question, f.answer]),
  },
];

// Whitespace-normalised so an edit that only reflows or re-indents text never
// counts as shrinkage.
function chars(texts: string[]): number {
  return texts.join(' ').replace(/\s+/g, ' ').trim().length;
}

// The character rule needs both a relative and an absolute threshold: 10%
// alone would flag a one-word trim in a short section, 40 characters alone
// would miss nothing but let a large section lose a whole paragraph. Together
// they mean "more text vanished than any wording fix removes".
const RELATIVE_TOLERANCE = 0.1;
const ABSOLUTE_TOLERANCE_CHARS = 40;

/**
 * Compares a draft against the copy the public page currently renders and
 * returns every section the draft would shrink. Empty result: safe to save.
 *
 * Flags a section when entries were removed (removals are deliberate clicks
 * in the editor, so confirming them is cheap and correct), or when the entry
 * count held but the text shrank beyond tolerance — the signature of
 * summarised-in-place content.
 */
export function assessContentShrinkage(
  baseline: CoursePublicContent,
  draft: CoursePublicContent,
): ShrunkenSection[] {
  const shrunken: ShrunkenSection[] = [];
  for (const section of SECTIONS) {
    const beforeItems = section.items(baseline);
    const afterItems = section.items(draft);
    const beforeChars = chars(section.texts(baseline));
    const afterChars = chars(section.texts(draft));

    const itemsDropped = afterItems < beforeItems;
    const charsDropped =
      beforeChars - afterChars > Math.max(ABSOLUTE_TOLERANCE_CHARS, beforeChars * RELATIVE_TOLERANCE);

    if (itemsDropped || charsDropped) {
      shrunken.push({ key: section.key, label: section.label, beforeItems, afterItems, beforeChars, afterChars });
    }
  }
  return shrunken;
}

// One human-readable line for the server's refusal message, so an API caller
// that never renders the editor's confirmation panel still learns exactly
// what it tried to remove.
export function describeShrinkage(sections: ShrunkenSection[]): string {
  return sections
    .map((s) => {
      const parts: string[] = [];
      if (s.afterItems < s.beforeItems) parts.push(`${s.beforeItems} → ${s.afterItems} entries`);
      if (s.afterChars < s.beforeChars) {
        parts.push(`text ${Math.round((1 - s.afterChars / Math.max(1, s.beforeChars)) * 100)}% shorter`);
      }
      return `${s.label}: ${parts.join(', ')}`;
    })
    .join('; ');
}
