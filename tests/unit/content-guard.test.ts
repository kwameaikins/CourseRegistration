import { describe, expect, it } from 'vitest';

import {
  assessContentShrinkage,
  describeShrinkage,
} from '@/modules/courses/content-guard';
import type { CoursePublicContent } from '@/modules/courses/public-content';

// The gate this covers exists so that content cannot silently disappear from
// a live programme page — neither by an admin's stray delete nor by a future
// model-driven rewrite that summarises instead of carrying text verbatim.
// What matters is the two detection rules (entries removed; same entries but
// meaningfully shorter text) and that ordinary editing never trips them.

function content(overrides: Partial<CoursePublicContent> = {}): CoursePublicContent {
  return {
    briefSlug: 'sample-brief',
    tagline: 'Learn the thing properly.',
    heroImage: null,
    overview: [
      'A first paragraph that describes the programme in reasonable detail so the section has real weight.',
      'A second paragraph explaining who the programme serves and what participants leave with at the end.',
    ],
    idealFor: 'Professionals who need the thing.',
    primaryAudience: ['Accountants preparing reports', 'Auditors reviewing them'],
    alsoSuitableFor: ['Students seeking practical skills'],
    outcomesLabel: 'What you will learn',
    outcomes: [
      'Prepare reports more efficiently using the techniques taught',
      'Analyse data and identify anomalies with confidence',
      'Design a repeatable workflow for the whole team',
    ],
    curriculum: [
      {
        heading: 'Day 1',
        title: 'Foundations',
        points: [
          'The landscape and what actually matters in it',
          'Selecting the appropriate tool for each task',
          'Safe handling of confidential information',
        ],
        practical: 'Practical exercise: run the guided setup end to end.',
      },
      {
        heading: 'Day 2',
        title: 'Application',
        points: [
          'Automating the preparation work from raw inputs',
          'Producing commentary that survives review',
        ],
      },
    ],
    format: [
      { label: 'Delivery', value: 'Live, instructor-led via Zoom' },
      { label: 'Duration', value: 'Two sessions, three hours each' },
    ],
    prerequisites: ['Working knowledge of the basics'],
    includes: ['Live instructor-led sessions', 'Course materials', 'A certificate of completion'],
    facilitator: { name: 'Ama Mensah', credentials: 'CA' },
    faq: [
      {
        question: 'Do I need prior experience?',
        answer: 'No. The programme is taught from first principles with setup guidance included.',
      },
    ],
    corporateNote: null,
    ...overrides,
  };
}

describe('assessContentShrinkage', () => {
  it('returns nothing when the draft is identical to the baseline', () => {
    expect(assessContentShrinkage(content(), content())).toEqual([]);
  });

  it('flags a section whose entries were removed', () => {
    const baseline = content();
    const draft = content({ outcomes: baseline.outcomes.slice(0, 1) });

    const shrunken = assessContentShrinkage(baseline, draft);
    expect(shrunken).toHaveLength(1);
    expect(shrunken[0]).toMatchObject({ key: 'outcomes', beforeItems: 3, afterItems: 1 });
  });

  it('flags summarised-in-place text: same entry count, much shorter', () => {
    const baseline = content();
    const draft = content({
      overview: ['A shorter paragraph.', 'Another short one.'],
    });

    const shrunken = assessContentShrinkage(baseline, draft);
    expect(shrunken.map((s) => s.key)).toEqual(['overview']);
    expect(shrunken[0].afterItems).toBe(shrunken[0].beforeItems);
  });

  it('catches a curriculum module that keeps its slot but loses its topics', () => {
    const baseline = content();
    const draft = content({
      curriculum: baseline.curriculum.map((session) => ({ ...session, points: [], practical: undefined })),
    });

    expect(assessContentShrinkage(baseline, draft).map((s) => s.key)).toEqual(['curriculum']);
  });

  it('ignores minor rewording and whitespace reflow', () => {
    const baseline = content();
    const draft = content({
      overview: [
        // Same first paragraph reflowed onto two lines, second lightly trimmed.
        'A first paragraph that describes the programme in reasonable detail\nso the section has real weight.',
        'A second paragraph explaining who the programme serves and what participants leave with.',
      ],
    });

    expect(assessContentShrinkage(baseline, draft)).toEqual([]);
  });

  it('ignores growth', () => {
    const baseline = content();
    const draft = content({
      outcomes: [...baseline.outcomes, 'Apply the review checklist to real work'],
    });

    expect(assessContentShrinkage(baseline, draft)).toEqual([]);
  });

  it('flags nothing against an empty baseline, so first-time authoring is never gated', () => {
    const empty = content({
      overview: [],
      primaryAudience: [],
      alsoSuitableFor: [],
      outcomes: [],
      curriculum: [],
      format: [],
      prerequisites: [],
      includes: [],
      faq: [],
    });

    expect(assessContentShrinkage(empty, content())).toEqual([]);
  });

  it('flags emptying a section outright', () => {
    const shrunken = assessContentShrinkage(content(), content({ curriculum: [] }));
    expect(shrunken.map((s) => s.key)).toEqual(['curriculum']);
    expect(shrunken[0].afterItems).toBe(0);
  });
});

describe('describeShrinkage', () => {
  it('names each section with its entry counts so the API error is self-explanatory', () => {
    const baseline = content();
    const shrunken = assessContentShrinkage(
      baseline,
      content({ outcomes: baseline.outcomes.slice(0, 1), curriculum: [] }),
    );

    const description = describeShrinkage(shrunken);
    expect(description).toContain('Outcomes: 3 → 1 entries');
    expect(description).toContain('Curriculum: 2 → 0 entries');
  });
});
