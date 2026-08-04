// Visual language for the public marketing pages (/programmes and
// /programmes/[courseCode]).
//
// WHY A SEPARATE STYLESHEET FROM THE PORTALS
// The portals are an application shell — a fixed navy rail, dense panels,
// tabular data for someone already logged in. A catalogue page has the
// opposite job: it is read once, by a stranger, often on a phone, and has to
// establish credibility before it asks for anything. Same brand tokens
// (components/brand.ts), different composition.
//
// The staff app's Tailwind theme is deliberately NOT used here. Those tokens
// are stock shadcn slate — cold greys with no relationship to the Knowsia
// navy and orange — which is exactly why the first version of this page
// looked generic.
//
// DESIGN NOTES
// * Type: Georgia-stack serif for display, system sans for body. No webfont
//   is loaded. Ghana traffic is mobile-heavy and often on metered data; a
//   200KB font download to render a headline is a real cost for no gain, and
//   system stacks render instantly with no layout shift.
// * Colour: navy anchors the page (hero, closing band), orange is reserved
//   almost entirely for calls to action. An accent used everywhere stops
//   being an accent — restricting it is what makes the CTA obvious.
// * Depth: one soft shadow token, used sparingly. Heavy shadows read cheap;
//   a hairline border plus a whisper of elevation reads considered.
// * Motion: transitions are short and confined to hover/focus, and the whole
//   lot is disabled under prefers-reduced-motion.
// * Accessibility: visible focus rings everywhere (never `outline: none`),
//   semantic landmarks, and a skip link. Body copy is capped near 68
//   characters per line, the range where prose stays comfortable to read.
import { BRAND_TOKENS } from '@/components/brand';

export const MARKETING_STYLES = `${BRAND_TOKENS}
.mk * { box-sizing: border-box; }
.mk {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.mk h1, .mk h2, .mk h3, .mk h4 { font-family: var(--font-display); font-weight: 600; margin: 0; line-height: 1.2; }
.mk p { margin: 0; }
.mk ul { margin: 0; padding: 0; }
.mk a { color: inherit; }
.mk .tnum { font-variant-numeric: tabular-nums; }
.mk .icon { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

.mk :where(a, button, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 4px;
}
.mk .skip {
  position: absolute; left: -9999px; top: 0; z-index: 50;
  background: var(--surface); color: var(--ink); padding: 10px 16px; border-radius: 0 0 8px 0;
}
.mk .skip:focus { left: 0; }

/* ---------- shell ---------- */
.mk .wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
.mk .prose { max-width: 68ch; }
.mk section { scroll-margin-top: 24px; }

/* ---------- hero ---------- */
.mk .hero {
  background:
    radial-gradient(900px 420px at 78% -12%, rgba(251,146,60,0.20), transparent 62%),
    linear-gradient(165deg, var(--rail-bg), var(--rail-bg-2));
  color: var(--rail-fg);
  padding: 28px 0 76px;
  position: relative;
  overflow: hidden;
}
.mk .hero::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--rail-accent), transparent);
  opacity: 0.55;
}
.mk .hero-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 46px; }
.mk .hero-nav .logo { height: 38px; width: auto; }
.mk .hero-nav a.plain { color: var(--rail-fg-muted); text-decoration: none; font-size: 14px; }
.mk .hero-nav a.plain:hover { color: var(--rail-fg); }
.mk .eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--rail-accent);
}
.mk .hero h1 {
  font-size: clamp(2rem, 5.2vw, 3.4rem);
  letter-spacing: -0.015em;
  margin-top: 14px;
  max-width: 17ch;
}
.mk .hero .lede { margin-top: 20px; max-width: 60ch; color: var(--rail-fg-muted); font-size: clamp(1rem, 1.6vw, 1.125rem); }
.mk .hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.mk .trust { display: flex; flex-wrap: wrap; gap: 10px 26px; margin-top: 38px; padding-top: 24px; border-top: 1px solid var(--rail-line); }
.mk .trust span { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--rail-fg-muted); }
.mk .trust .icon { width: 16px; height: 16px; stroke: var(--rail-accent); }

/* ---------- buttons ---------- */
.mk .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  height: 48px; padding: 0 26px; border-radius: 10px;
  font-family: var(--font-body); font-size: 15px; font-weight: 600;
  text-decoration: none; cursor: pointer; border: 1px solid transparent;
  transition: background-color .16s ease, border-color .16s ease, transform .16s ease, box-shadow .16s ease;
}
.mk .btn-primary { background: var(--accent); color: var(--accent-contrast); box-shadow: 0 1px 2px rgba(0,0,0,.14); }
.mk .btn-primary:hover { background: var(--accent-deep); transform: translateY(-1px); box-shadow: 0 6px 18px -8px rgba(194,65,12,.7); }
.mk .btn-ghost-light { border-color: rgba(255,255,255,0.28); color: var(--rail-fg); }
.mk .btn-ghost-light:hover { background: rgba(255,255,255,0.08); }
.mk .btn-outline { border-color: var(--line); color: var(--ink); background: var(--surface); }
.mk .btn-outline:hover { border-color: var(--accent); color: var(--accent); }
.mk .btn-sm { height: 42px; padding: 0 18px; font-size: 14px; }
.mk .btn-block { width: 100%; }

/* ---------- section furniture ---------- */
.mk .band { padding: 76px 0; }
.mk .band-tint { background: var(--surface-2); border-block: 1px solid var(--line); }
.mk .band-head { max-width: 62ch; margin-bottom: 40px; }
.mk .band-head h2 { font-size: clamp(1.55rem, 3.2vw, 2.15rem); letter-spacing: -0.01em; }
.mk .band-head p { margin-top: 12px; color: var(--ink-muted); }
.mk .kicker { font-size: 12px; font-weight: 600; letter-spacing: 0.10em; text-transform: uppercase; color: var(--accent); }

/* ---------- programme cards ---------- */
.mk .cards { display: grid; gap: 24px; grid-template-columns: 1fr; }
@media (min-width: 900px) { .mk .cards { grid-template-columns: repeat(2, 1fr); } }
.mk .card {
  background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
  padding: 26px; display: flex; flex-direction: column; gap: 16px;
  box-shadow: var(--shadow);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.mk .card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); box-shadow: 0 2px 4px rgba(33,28,23,.05), 0 20px 40px -22px rgba(33,28,23,.34); }
.mk .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.mk .card h3 { font-size: 1.3rem; letter-spacing: -0.01em; }
.mk .card .promise { color: var(--ink); font-weight: 500; }
.mk .card .blurb { color: var(--ink-muted); font-size: 15px; }
.mk .card .cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; padding-top: 4px; }

.mk .tag {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 5px 10px; border-radius: 999px; white-space: nowrap;
}
.mk .tag-free { background: var(--success-bg); color: var(--success); }
.mk .tag-code { background: var(--accent-tint); color: var(--accent-deep); }
.mk .tag-full { background: var(--warning-bg); color: var(--warning); }

/* ---------- the facts strip (dates / price / seats) ---------- */
.mk .facts { border: 1px solid var(--line); border-radius: 12px; background: var(--surface-2); overflow: hidden; }
.mk .facts-head {
  padding: 9px 16px; border-bottom: 1px solid var(--line);
  font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-faint);
}
.mk .facts-row { padding: 14px 16px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; }
.mk .facts-row + .facts-row { border-top: 1px solid var(--line); }
.mk .facts-row .when { font-weight: 600; }
.mk .facts-row .meta { font-size: 14px; color: var(--ink-muted); }
.mk .facts-row .price { margin-left: auto; font-weight: 700; font-variant-numeric: tabular-nums; }
.mk .facts-row .was { font-weight: 400; color: var(--ink-faint); text-decoration: line-through; margin-right: 6px; }
.mk .facts-row .note { flex-basis: 100%; font-size: 13px; color: var(--ink-muted); }
.mk .facts-row .note .hot { color: var(--accent); font-weight: 600; }
.mk .facts-row .note .ok { color: var(--success); font-weight: 600; }
.mk .facts-more { padding: 9px 16px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-muted); }
.mk .facts-empty { padding: 16px; font-size: 14px; color: var(--ink-muted); }

/* ---------- feature grid ---------- */
.mk .grid-3 { display: grid; gap: 26px; grid-template-columns: 1fr; }
@media (min-width: 720px) { .mk .grid-3 { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1000px) { .mk .grid-3 { grid-template-columns: repeat(3, 1fr); } }
.mk .feature .icon-badge {
  width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center;
  background: var(--accent-tint); color: var(--accent-deep); margin-bottom: 14px;
}
.mk .feature h3 { font-size: 1.05rem; }
.mk .feature p { margin-top: 7px; color: var(--ink-muted); font-size: 15px; }

/* ---------- numbered steps ---------- */
.mk .steps { display: grid; gap: 26px; grid-template-columns: 1fr; counter-reset: step; }
@media (min-width: 720px) { .mk .steps { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1000px) { .mk .steps { grid-template-columns: repeat(4, 1fr); } }
.mk .step { padding-top: 18px; border-top: 2px solid var(--line); }
.mk .step .num { font-family: var(--font-display); font-size: 1.6rem; color: var(--accent); line-height: 1; }
.mk .step h3 { font-size: 1.02rem; margin-top: 10px; }
.mk .step p { margin-top: 6px; color: var(--ink-muted); font-size: 14.5px; }

/* ---------- quotes ---------- */
.mk .quotes { display: grid; gap: 20px; grid-template-columns: 1fr; }
@media (min-width: 820px) { .mk .quotes { grid-template-columns: repeat(2, 1fr); } }
.mk .quote { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 24px; box-shadow: var(--shadow); }
.mk .quote .mark { font-family: var(--font-display); font-size: 2.4rem; line-height: 0.7; color: var(--accent); opacity: .5; }
.mk .quote blockquote { margin: 10px 0 0; font-size: 15.5px; }
.mk .quote figcaption { margin-top: 14px; font-size: 13.5px; font-weight: 600; }
.mk .quote figcaption span { display: block; font-weight: 400; color: var(--ink-faint); }

/* ---------- faq ---------- */
.mk .faq { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); overflow: hidden; }
.mk .faq details + details { border-top: 1px solid var(--line); }
.mk .faq summary {
  padding: 18px 22px; cursor: pointer; font-weight: 600; list-style: none;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.mk .faq summary::-webkit-details-marker { display: none; }
.mk .faq summary::after {
  content: '+'; font-family: var(--font-display); font-size: 1.4rem; line-height: 1;
  color: var(--accent); flex-shrink: 0; transition: transform .18s ease;
}
.mk .faq details[open] summary::after { transform: rotate(45deg); }
.mk .faq summary:hover { background: var(--surface-2); }
.mk .faq .answer { padding: 0 22px 20px; color: var(--ink-muted); max-width: 74ch; }

/* ---------- closing band + footer ---------- */
.mk .closer {
  background: linear-gradient(160deg, var(--rail-bg), var(--rail-bg-2));
  color: var(--rail-fg); border-radius: 20px; padding: 52px 40px; text-align: center;
}
.mk .closer h2 { font-size: clamp(1.5rem, 3.2vw, 2.1rem); max-width: 22ch; margin-inline: auto; }
.mk .closer p { margin-top: 14px; color: var(--rail-fg-muted); max-width: 56ch; margin-inline: auto; }
.mk .closer .hero-cta { justify-content: center; }
.mk .foot { padding: 40px 0 60px; font-size: 14px; color: var(--ink-muted); text-align: center; }
.mk .foot a { color: var(--accent); text-decoration: none; }
.mk .foot a:hover { text-decoration: underline; }

/* ---------- detail page ---------- */
.mk .detail-grid { display: grid; gap: 40px; grid-template-columns: 1fr; align-items: start; }
@media (min-width: 1000px) { .mk .detail-grid { grid-template-columns: minmax(0,1fr) 340px; gap: 56px; } }
.mk .sticky { position: static; }
@media (min-width: 1000px) { .mk .sticky { position: sticky; top: 28px; } }
.mk .buybox { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); }
.mk .buybox .price-now { font-family: var(--font-display); font-size: 2rem; line-height: 1; }
.mk .buybox .price-was { color: var(--ink-faint); text-decoration: line-through; font-size: 15px; }
.mk .article > section + section { margin-top: 44px; }
.mk .article h2 { font-size: clamp(1.35rem, 2.6vw, 1.7rem); }
.mk .article p + p { margin-top: 14px; }
.mk .list { list-style: none; display: grid; gap: 11px; margin-top: 16px; }
.mk .list li { display: flex; gap: 11px; align-items: flex-start; color: var(--ink-muted); }
.mk .list .icon { width: 19px; height: 19px; margin-top: 2px; stroke: var(--accent); }
.mk .module { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 20px 22px; }
.mk .module + .module { margin-top: 14px; }
.mk .module .step-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.mk .module h3 { font-size: 1.1rem; margin-top: 5px; }
.mk .module ul { list-style: disc; padding-left: 20px; margin-top: 12px; display: grid; gap: 6px; color: var(--ink-muted); font-size: 15px; }
.mk .module .practical { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: var(--accent-tint); color: var(--accent-deep); font-size: 14.5px; }
.mk .spec { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--surface); margin-top: 16px; }
.mk .spec div { display: flex; flex-wrap: wrap; gap: 4px 18px; padding: 13px 18px; font-size: 15px; }
.mk .spec div + div { border-top: 1px solid var(--line); }
.mk .spec dt { width: 150px; flex-shrink: 0; font-weight: 600; }
.mk .spec dd { margin: 0; color: var(--ink-muted); }
.mk .callout { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 12px; background: var(--surface); padding: 22px; }
.mk .crumb { font-size: 14px; color: var(--ink-muted); }
.mk .crumb a { color: var(--ink-muted); text-decoration: none; }
.mk .crumb a:hover { color: var(--accent); }

@media (prefers-reduced-motion: reduce) {
  .mk *, .mk *::before, .mk *::after { transition: none !important; animation: none !important; }
  .mk .card:hover, .mk .btn-primary:hover { transform: none; }
}
`;

// Icons used by the marketing pages. Same hairline stroke style as
// PortalIcons so the two surfaces feel like one product, but only the symbols
// these pages actually reference — a marketing page has no business shipping
// the portal's full icon set.
export function MarketingIcons() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <symbol id="m-live" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></symbol>
        <symbol id="m-hands" viewBox="0 0 24 24"><path d="M4 20l.9-3.6L16.4 5 19 7.6 7.6 19z" /><path d="M14.5 6.9 17.1 9.5" /></symbol>
        <symbol id="m-award" viewBox="0 0 24 24"><circle cx="12" cy="8" r="5.5" /><path d="M8.5 12.8 7 21l5-2.5 5 2.5-1.5-8.2" /></symbol>
        <symbol id="m-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="M9 12.2l2 2 4-4.2" /></symbol>
        <symbol id="m-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.3" /><path d="M3 20c.9-3.4 3-5.2 6-5.2s5.1 1.8 6 5.2" /><circle cx="17" cy="9" r="2.6" /><path d="M15.5 14.5c2.4.3 3.8 1.9 4.5 5" /></symbol>
        <symbol id="m-support" viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v10c0 .8-.7 1.5-1.5 1.5H9l-4 3v-3H5.5A1.5 1.5 0 0 1 4 15.5z" /></symbol>
        <symbol id="m-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5 5.5-6" /></symbol>
        <symbol id="m-calendar" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></symbol>
        <symbol id="m-arrow" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></symbol>
      </defs>
    </svg>
  );
}

// Maps the "Why Learn with Knowsia?" copy to icons by position. Kept here
// rather than in public-content.ts so the founder's copy file stays pure
// prose with no presentation concerns leaking into it.
export const WHY_ICONS = [
  'm-hands',
  'm-users',
  'm-live',
  'm-award',
  'm-shield',
  'm-support',
] as const;
