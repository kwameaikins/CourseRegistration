// Skip-to-content link (UX review, 2026-07-28 — WCAG 2.4.1 Bypass Blocks;
// no skip link existed anywhere in the app before this). Visually hidden
// until focused, so it doesn't affect sighted layout at all but lets a
// keyboard/screen-reader user jump straight past the nav on every page
// load instead of tabbing through it every time.
export function SkipLink({ targetId }: { targetId: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      Skip to content
    </a>
  );
}
