// Shared question copy for the post-course feedback questionnaire (redesigned
// 2026-07-27), so wording never drifts between the public feedback page and
// the in-portal feedback tab even though each renders it with its own design
// system (shadcn/Tailwind vs. the portal's bespoke CSS).

export const FEEDBACK_RATING_QUESTIONS = [
  { key: 'overallRating', label: 'Overall, how would you rate the course?' },
  {
    key: 'relevanceRating',
    label: 'How relevant was the course to your work, studies, or career goals?',
  },
  {
    key: 'facilitatorRating',
    label: "How would you rate the facilitator's knowledge and delivery?",
  },
  { key: 'confidenceRating', label: 'How confident are you in applying what you learned?' },
] as const;

export const FEEDBACK_MATERIALS_LABEL = 'Were the course materials clear and useful?';
export const FEEDBACK_MATERIALS_OPTIONS = ['Yes', 'Partly', 'No'] as const;

export const FEEDBACK_MOST_VALUABLE_LABEL = 'What was the most valuable thing you learned?';
export const FEEDBACK_IMPROVEMENT_LABEL = 'What should we improve about the course?';

export const FEEDBACK_RECOMMEND_LABEL = 'Would you recommend this course to others?';
export const FEEDBACK_RECOMMEND_OPTIONS = ['Yes', 'Maybe', 'No'] as const;

export const FEEDBACK_OTHER_COURSE_LABEL =
  'Which other course would you like Knowsia to offer?';

// States the consequence rather than asking for "permission" in the abstract:
// the person is agreeing that their words AND their name appear on a public
// website. Someone who says yes should not be able to be surprised later.
export const FEEDBACK_TESTIMONIAL_LABEL =
  'May we publish your feedback and your name on our website?';
// Yes/No only (founder decision 2026-08-17). An unattributed quote is weak
// proof — "Anonymous participant" persuades nobody — so the choice is now
// simply whether we may quote you by name.
//
// "Yes" still STORES 'Named', which is why this needed no migration and no
// change to the testimonial_choice CHECK constraint (202607270035). The stored
// vocabulary keeps three values because history has three: 22 existing rows say
// 'Anonymous', and those people consented to publication WITHOUT their name.
// They keep being published exactly that way. Retroactively attributing them
// would publish a name each of them explicitly declined to give.
export const FEEDBACK_TESTIMONIAL_OPTIONS = [
  { value: 'Named', label: 'Yes' },
  { value: 'No', label: 'No' },
] as const;
