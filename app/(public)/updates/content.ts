// /updates — what changed at Knowsia, newest first.
//
// This is the PRODUCT AND COMPANY log: what shipped, what opened, what moved.
// It is deliberately NOT the same thing as /news, which is Knowsia Insights —
// the accounting and finance news written for our audience, published through
// the Editorial Dashboard. Industry news goes there; our own announcements go
// here.
//
// Why a file and not a table: an announcement is written once, by a person,
// and read by everyone. It needs no pipeline, no review queue and no database
// round trip — the same reasoning that keeps the privacy policy in
// ./content.ts next door. Add an entry by adding an object to the top of the
// list and deploying.
//
// TWO RULES, because this page is public and dated:
//   1. Every entry must be TRUE on the date it claims. This page is evidence
//      a customer can hold you to.
//   2. `date` is the date the thing actually happened, not the date it was
//      written up.

export type UpdateCategory = 'Platform' | 'Programmes' | 'Company';

export interface UpdateEntry {
  /** ISO date, used for sorting and the <time> element. */
  date: string;
  /** How it reads to a human: "7 September 2026". */
  displayDate: string;
  category: UpdateCategory;
  title: string;
  body: string;
  /** Optional "see it" link. Internal paths only. */
  link?: { href: string; label: string; external?: boolean };
}

export const UPDATE_ENTRIES: UpdateEntry[] = [
  {
    date: '2026-09-07',
    displayDate: '7 September 2026',
    category: 'Platform',
    title: 'The tutor now reads lessons aloud, and works questions with you',
    body:
      'Every lesson, worked example and model answer on the study platform can now be read aloud in your browser — no download, no extra cost, and it works on a phone. Alongside it, the guided whiteboard walks you through a question one step at a time and stops the moment you say you have got it, so you finish the working yourself. Both are available on every plan.',
    link: { href: '/learn/catalogue', label: 'Open the study platform', external: true },
  },
  {
    date: '2026-08-03',
    displayDate: '3 August 2026',
    category: 'Company',
    title: 'Knowsia Insights is live',
    body:
      'We now publish accounting and finance news written for practitioners in Ghana and across West Africa — what changed at ICAG, IFAC and the standard setters, and what it means for your work. Every story is checked against its sources before it goes up.',
    link: { href: '/news', label: 'Read Insights' },
  },
];

// Newest first, regardless of the order anyone types them in.
export const UPDATES_SORTED: UpdateEntry[] = [...UPDATE_ENTRIES].sort((a, b) =>
  b.date.localeCompare(a.date),
);
