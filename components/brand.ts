// The Knowsia brand tokens — the single definition shared by the four
// session-based portals (components/portal/portal-design-system.tsx) and the
// public marketing pages (components/marketing/marketing-design-system.tsx).
//
// Extracted 2026-08-04 for the same reason portal-design-system itself was
// extracted in 2026-07-27: two copies of a palette drift, and a marketing page
// that renders in slightly the wrong navy is worse than one that is obviously
// unstyled. Anything that needs a brand colour imports from here — nothing
// redeclares a hex value of its own.
//
// Real brand colours (2026-07-26): orange from the Knowsia logo, navy
// #1E3A8A — the same navy and orange the certificate PDF draws with
// (lib/certificates/pdf.ts). No invented purple.
//
// Dark mode is honoured because the tokens already carry a full dark palette;
// a public page that ignores prefers-color-scheme while every portal respects
// it reads as unfinished.
export const BRAND_TOKENS = `
:root {
  --font-display: Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif;
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

  --rail-bg: #12204C;
  --rail-bg-2: #1E3A8A;
  --rail-fg: #F3F5FA;
  --rail-fg-muted: #9FB0D9;
  --rail-active-bg: rgba(255,255,255,0.09);
  --rail-line: rgba(255,255,255,0.10);
  --rail-accent: #FB923C;

  --ink: #211C17;
  --ink-muted: #5C554B;
  --ink-faint: #948C7E;
  --paper: #F7F6F3;
  --surface: #FFFFFF;
  --surface-2: #FBFAF8;
  --line: #E6E2DA;
  --accent: #C2410C;
  --accent-deep: #9A3412;
  --accent-contrast: #FFFFFF;
  --accent-tint: #FFEDD5;
  --success: #047857;
  --success-bg: #D1FAE5;
  --warning: #A16207;
  --warning-bg: #FEF3C7;
  --danger: #B91C1C;
  --danger-bg: #FEE2E2;
  --shadow: 0 1px 2px rgba(33,28,23,0.05), 0 8px 24px -12px rgba(33,28,23,0.14);
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #EDEFF3; --ink-muted: #A6ADBD; --ink-faint: #6E7690;
    --paper: #0E1526; --surface: #17203A; --surface-2: #1C2544; --line: #2B3555;
    --accent: #FB923C; --accent-deep: #F97316; --accent-contrast: #1C1109; --accent-tint: rgba(251,146,60,0.16);
    --success: #34D399; --success-bg: rgba(52,211,153,0.14);
    --warning: #EAB308; --warning-bg: rgba(234,179,8,0.14);
    --danger: #F87171; --danger-bg: rgba(248,113,113,0.14);
    --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 12px 28px -14px rgba(0,0,0,0.6);
  }
}`;
