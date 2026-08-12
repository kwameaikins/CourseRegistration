// Shared visual language for the two non-staff, session-based portals
// (student portal, company portal — see Coding Docs/06_Security_and_
// Authentication.md Section 13 for why they share one auth pattern).
// Extracted 2026-07-27 when the corporate portal got the same app-shell
// redesign the student portal already had, to avoid two copies of the
// same ~230 lines of CSS drifting apart. Real brand colors (2026-07-26):
// orange from the Knowsia logo, navy #1E3A8A — no invented purple. The
// palette itself now lives in components/brand.ts (2026-08-04).
import { BRAND_TOKENS } from '@/components/brand';

export function PortalIcons() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></symbol>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5z" /></symbol>
        <symbol id="i-card" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></symbol>
        <symbol id="i-award" viewBox="0 0 24 24"><circle cx="12" cy="8" r="5.5" /><path d="M8.5 12.8 7 21l5-2.5 5 2.5-1.5-8.2" /></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v10c0 .8-.7 1.5-1.5 1.5H9l-4 3v-3H5.5A1.5 1.5 0 0 1 4 15.5z" /></symbol>
        <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M15 9l-2 6-6 2 2-6z" /></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" /></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.3" /><path d="M3 20c.9-3.4 3-5.2 6-5.2s5.1 1.8 6 5.2" /><circle cx="17" cy="9" r="2.6" /><path d="M15.5 14.5c2.4.3 3.8 1.9 4.5 5" /></symbol>
        <symbol id="i-building" viewBox="0 0 24 24"><rect x="4" y="3" width="12" height="18" rx="1" /><path d="M16 9h4v12h-4" /><path d="M7.5 7h1M11.5 7h1M7.5 11h1M11.5 11h1M7.5 15h1M11.5 15h1" /></symbol>
        <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M15 16l4-4-4-4" /><path d="M19 12H9" /></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></symbol>
        <symbol id="i-linkedin" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10.5V17M8 7.2v.1M12.2 17v-4c0-1.4.9-2.4 2.2-2.4 1.3 0 2.1.9 2.1 2.4V17" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5 5.5-6" /></symbol>
        <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3.5 21 19H3z" /><path d="M12 9.5v4.2" /><path d="M12 16.8v.1" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M10 8.5l6 3.5-6 3.5z" /></symbol>
        <symbol id="i-zoom" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20l.9-3.6L16.4 5 19 7.6 7.6 19z" /><path d="M14.5 6.9 17.1 9.5" /></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></symbol>
      </defs>
    </svg>
  );
}

// The :root token block moved to components/brand.ts (2026-08-04) so the
// public marketing pages render in the same navy and orange as the portals
// without a second copy of the palette to keep in sync. Composed here, so the
// emitted CSS is byte-identical to what it was before the extraction.
export const PORTAL_STYLES = `${BRAND_TOKENS}
.portal-app * { box-sizing: border-box; }
.portal-app {
  background: var(--paper); color: var(--ink); font-family: var(--font-body);
  font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased; min-height: 100vh;
}
.portal-app h1, .portal-app h2, .portal-app h3, .portal-app h4 { font-family: var(--font-display); font-weight: 600; margin: 0; }
.portal-app a { color: inherit; }
.portal-app button { font-family: inherit; }
.portal-app .tnum { font-variant-numeric: tabular-nums; }
.portal-loading { min-height: 100vh; display: grid; place-items: center; font-family: var(--font-body, sans-serif); color: #5C554B; }
.portal-app .icon { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

.portal-app .app { display: flex; min-height: 100vh; }
.portal-app .rail {
  width: 264px; flex-shrink: 0; background: linear-gradient(180deg, var(--rail-bg), var(--rail-bg-2));
  color: var(--rail-fg); display: flex; flex-direction: column; padding: 22px 16px 16px;
  position: sticky; top: 0; height: 100vh;
}
.portal-app .rail-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; }
.portal-app .rail-brand .mark { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; object-fit: cover; }
.portal-app .rail-brand .name { font-family: var(--font-display); font-size: 17px; font-weight: 600; }
.portal-app .rail-brand .tag { display: block; font-size: 11px; color: var(--rail-fg-muted); letter-spacing: 0.04em; }
.portal-app .identity { display: flex; align-items: center; gap: 10px; padding: 12px; margin: 0 4px 18px; background: rgba(255,255,255,0.05); border: 1px solid var(--rail-line); border-radius: 10px; }
.portal-app .identity .avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--rail-active-bg); color: var(--rail-accent); display: grid; place-items: center; font-weight: 600; font-size: 14px; border: 1px solid var(--rail-line); flex-shrink: 0; }
.portal-app .identity .who { min-width: 0; }
.portal-app .identity .who strong { display: block; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.portal-app .identity .who span { display: block; font-size: 11.5px; color: var(--rail-fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.portal-app .rail-nav { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.portal-app .rail-nav button { width: 100%; display: flex; align-items: center; gap: 10px; background: none; border: none; color: var(--rail-fg-muted); padding: 9px 10px; border-radius: 8px; font-size: 13.5px; font-weight: 500; cursor: pointer; text-align: left; }
.portal-app .rail-nav button:hover { background: rgba(255,255,255,0.05); color: var(--rail-fg); }
.portal-app .rail-nav button[aria-current="page"] { background: var(--rail-active-bg); color: #fff; }
.portal-app .rail-nav button[aria-current="page"] .icon { stroke: var(--rail-accent); }
.portal-app .rail-nav .badge { margin-left: auto; font-size: 10.5px; font-weight: 700; background: var(--rail-accent); color: var(--rail-bg); min-width: 17px; height: 17px; border-radius: 999px; display: grid; place-items: center; padding: 0 5px; }
.portal-app .rail-foot { border-top: 1px solid var(--rail-line); padding-top: 12px; margin-top: 8px; }
.portal-app .rail-foot .support { font-size: 12px; color: var(--rail-fg-muted); padding: 0 10px 10px; line-height: 1.5; }
.portal-app .rail-foot .support a { color: var(--rail-accent); text-decoration: none; }
.portal-app .rail-foot button.logout { width: 100%; display: flex; align-items: center; gap: 9px; background: none; border: 1px solid var(--rail-line); color: var(--rail-fg); padding: 9px 10px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.portal-app .rail-foot button.logout:hover { background: rgba(255,255,255,0.06); }

.portal-app .main { flex: 1; min-width: 0; }
.portal-app .topbar { display: none; }
.portal-app .content { max-width: 960px; margin: 0 auto; padding: 40px 40px 80px; }
.portal-app .panel.active { display: block; }
.portal-app .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent); margin: 0 0 6px; }
.portal-app .panel-title { font-size: 24px; margin-bottom: 4px; }
.portal-app .panel-sub { color: var(--ink-muted); font-size: 14px; margin: 0 0 28px; max-width: 68ch; }
.portal-app .empty-note { color: var(--ink-muted); font-size: 13.5px; }
.portal-app .link-btn { background: none; border: none; padding: 0; color: var(--accent); font-weight: 600; font-size: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

.portal-app .hero-banner { background: linear-gradient(135deg, #C2410C, #1E3A8A); color: #fff; border-radius: 14px; padding: 22px 26px; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.portal-app .hero-banner .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.85; margin-bottom: 6px; }
.portal-app .hero-banner h2 { font-size: 19px; color: #fff; }
.portal-app .hero-banner .when { font-size: 13.5px; opacity: 0.92; margin-top: 4px; }
.portal-app .btn { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 600; padding: 10px 16px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; text-decoration: none; white-space: nowrap; }
.portal-app .btn-primary { background: var(--accent); color: var(--accent-contrast); }
.portal-app .btn-primary:hover { background: var(--accent-deep); }
.portal-app .btn-onaccent { background: #fff; color: #1E3A8A; }
.portal-app .btn-onaccent:hover { background: #EEF2FB; }
.portal-app .btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.portal-app .btn-ghost:hover { background: var(--surface-2); }
.portal-app .btn-outline { background: transparent; color: var(--accent); border-color: var(--accent); }
.portal-app .btn-outline:hover { background: var(--accent-tint); }
.portal-app .btn-sm { padding: 7px 12px; font-size: 12.5px; }
.portal-app .btn[disabled] { opacity: 0.5; cursor: not-allowed; }

.portal-app .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
.portal-app .stat-tile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; box-shadow: var(--shadow); }
.portal-app .stat-tile .icon-wrap { width: 30px; height: 30px; border-radius: 8px; background: var(--accent-tint); color: var(--accent); display: grid; place-items: center; margin-bottom: 10px; }
.portal-app .stat-tile .num { font-family: var(--font-display); font-size: 26px; display: block; }
.portal-app .stat-tile .lbl { font-size: 12.5px; color: var(--ink-muted); }
.portal-app .stat-tile.warn .num { color: var(--warning); }

.portal-app .section-heading { display: flex; align-items: baseline; justify-content: space-between; margin: 30px 0 14px; }
.portal-app .section-heading h3 { font-size: 16px; }
.portal-app .mini-course-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; }
.portal-app .mini-course-row .name { font-weight: 600; font-size: 14px; }
.portal-app .mini-course-row .meta { font-size: 12.5px; color: var(--ink-muted); margin-top: 2px; }

.portal-app .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
.portal-app .pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.portal-app .pill-success { background: var(--success-bg); color: var(--success); }
.portal-app .pill-warning { background: var(--warning-bg); color: var(--warning); }
.portal-app .pill-danger { background: var(--danger-bg); color: var(--danger); }
.portal-app .pill-neutral { background: var(--surface-2); color: var(--ink-muted); border: 1px solid var(--line); }

.portal-app .course-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 22px; margin-bottom: 20px; box-shadow: var(--shadow); }
.portal-app .course-card .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.portal-app .course-card .head h4 { font-size: 18px; margin: 0 0 4px; }
.portal-app .course-card .head .meta { font-size: 13px; color: var(--ink-muted); }
.portal-app .course-card .badges { display: flex; gap: 6px; flex-wrap: wrap; }
.portal-app .fig-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin: 18px 0; }
.portal-app .fig-grid > div { background: var(--surface-2); padding: 12px 14px; }
.portal-app .fig-grid .lbl { font-size: 11px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.04em; display: block; }
.portal-app .fig-grid .val { font-size: 16px; font-weight: 600; margin-top: 2px; }
.portal-app .fig-grid .val.balance { color: var(--warning); }
.portal-app .join-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.portal-app .pay-block { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--line); padding-top: 16px; }
.portal-app .stat-tile.tile-action { cursor: pointer; }
.portal-app .stat-tile.tile-action:hover { border-color: var(--warning); }
.portal-app .stat-tile.tile-action:focus-visible { outline: 2px solid var(--warning); outline-offset: 2px; }
.portal-app .due-list { display: flex; flex-direction: column; gap: 12px; margin: 16px 0 24px; }
.portal-app .due-card { border: 1px solid var(--line); border-radius: 10px; padding: 14px; background: var(--surface-2); }
.portal-app .due-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.portal-app .due-head .meta { display: block; font-size: 12px; color: var(--ink-muted); margin-top: 2px; }
.portal-app .due-head .val { font-size: 17px; font-weight: 700; }
.portal-app .due-head .val.balance { color: var(--warning); }
.portal-app .coupon-row { display: flex; gap: 8px; align-items: center; }
.portal-app .coupon-row input { flex: 1; min-width: 0; height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.04em; }
.portal-app .coupon-row input:disabled { opacity: 0.6; }
.portal-app .coupon-row .btn { flex-shrink: 0; }
.portal-app .confirming-note { background: var(--success-bg); color: var(--success); padding: 12px; border-radius: 8px; font-size: 13px; }
.portal-app .plan-box { background: var(--surface-2); border-radius: 8px; padding: 12px; }
.portal-app .plan-box-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); margin: 0 0 6px; }
.portal-app .plan-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 13.5px; }
.portal-app .plan-confirm { border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: 13.5px; }
.portal-app .plan-confirm-error { color: var(--danger); margin: 6px 0; }

.portal-app .tabbed { border: 1px solid var(--line); border-radius: 10px; margin-top: 18px; overflow: hidden; }
.portal-app .tabbed-nav { display: flex; background: var(--surface-2); border-bottom: 1px solid var(--line); overflow-x: auto; }
.portal-app .tabbed-nav button { background: none; border: none; padding: 10px 16px; font-size: 12.5px; font-weight: 600; color: var(--ink-muted); cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
.portal-app .tabbed-nav button.active { color: var(--accent); border-bottom-color: var(--accent); }
.portal-app .tabbed-body { padding: 16px; }
.portal-app .att-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.portal-app .att-list li { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
.portal-app .att-list li:last-child { border-bottom: none; }
.portal-app .att-list .duration { color: var(--ink-muted); }

.portal-app .msg-item { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px dashed var(--line); font-size: 13px; align-items: flex-start; }
.portal-app .msg-item:last-child { border-bottom: none; }
.portal-app .msg-item .chan { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; background: var(--accent-tint); color: var(--accent); }
.portal-app .msg-item .body { flex: 1; min-width: 0; }
.portal-app .msg-item .type { font-weight: 600; }
.portal-app .msg-item .when { color: var(--ink-faint); font-size: 12px; }
.portal-app .msg-item.failed .chan { background: var(--danger-bg); color: var(--danger); }

.portal-app .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: var(--shadow); }
.portal-app table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 640px; }
.portal-app thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.portal-app tbody td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.portal-app tbody tr:last-child td { border-bottom: none; }
.portal-app tbody td.num { text-align: right; }
.portal-app .course-cell strong { display: block; font-size: 13.5px; }
.portal-app .course-cell span { display: block; font-size: 12px; color: var(--ink-muted); }
.portal-app tfoot td { padding: 12px 16px; font-weight: 700; border-top: 1px solid var(--line); }

.portal-app .cert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.portal-app .cert-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
.portal-app .cert-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--accent), var(--accent-deep)); }
.portal-app .cert-card .cert-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent-tint); color: var(--accent); display: grid; place-items: center; margin-bottom: 14px; }
.portal-app .cert-card h4 { font-size: 16px; margin-bottom: 4px; }
.portal-app .cert-card .num { font-size: 12px; color: var(--ink-muted); font-family: var(--font-body); }
.portal-app .cert-card .issued { font-size: 12.5px; color: var(--ink-muted); margin: 10px 0 16px; }
.portal-app .cert-card .actions { display: flex; gap: 8px; flex-wrap: wrap; }
.portal-app .cert-card .verify { margin-top: 12px; font-size: 11.5px; color: var(--ink-faint); }
.portal-app .cert-card .verify a { color: var(--accent); text-decoration: none; }
.portal-app .cert-pending { border: 1px dashed var(--line); border-radius: 14px; padding: 20px; display: flex; align-items: center; gap: 14px; color: var(--ink-muted); background: var(--surface-2); }
.portal-app .cert-pending .icon-wrap { width: 40px; height: 40px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); display: grid; place-items: center; color: var(--ink-faint); flex-shrink: 0; }
.portal-app .cert-pending strong { color: var(--ink); display: block; font-size: 13.5px; margin-bottom: 2px; }
.portal-app .cert-pending span { font-size: 12.5px; }

.portal-app .explore-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.portal-app .explore-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 10px; }
.portal-app .explore-card h4 { font-size: 15.5px; }
.portal-app .explore-card .meta { font-size: 12.5px; color: var(--ink-muted); }
.portal-app .explore-card .price { margin-top: auto; display: flex; align-items: baseline; gap: 8px; }
.portal-app .explore-card .price .was { text-decoration: line-through; color: var(--ink-faint); font-size: 12.5px; }
.portal-app .explore-card .price .now { font-size: 17px; font-weight: 700; font-family: var(--font-display); }
.portal-app .explore-card .price .now.disc { color: var(--success); }
.portal-app .explore-card .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.portal-app .seats { font-size: 12px; color: var(--ink-muted); }
/* One-click enrolment top-up (2026-08-12) — only rendered when a participant's
   record predates a field a Registration needs, so it is a rare, small inline
   form rather than a full re-registration. */
.portal-app .explore-card .topup { display: flex; flex-direction: column; gap: 8px; }
.portal-app .explore-card .topup input, .portal-app .explore-card .topup select { width: 100%; padding: 9px 11px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-size: 13.5px; font-family: inherit; }
.portal-app .explore-card .topup input:focus, .portal-app .explore-card .topup select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }

.portal-app .account-card, .portal-app .name-edit-form { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 22px; max-width: 480px; box-shadow: var(--shadow); }
.portal-app .field-static { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-bottom: 1px dashed var(--line); }
.portal-app .field-static:last-of-type { border-bottom: none; }
.portal-app .field-static .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
.portal-app .field-static .val { font-size: 14.5px; font-weight: 600; }
.portal-app .field { margin-bottom: 14px; }
.portal-app .field label { display: block; font-size: 12px; font-weight: 600; color: var(--ink-muted); margin-bottom: 6px; }
.portal-app .field input, .portal-app .field textarea, .portal-app .field select { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-size: 14px; font-family: inherit; }
.portal-app .field input:focus, .portal-app .field textarea:focus, .portal-app .field select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.portal-app .field textarea { resize: vertical; min-height: 90px; }
.portal-app .session-note { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-muted); margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.portal-app .session-note .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); }

.portal-app .feedback-banner { background: var(--accent-tint); border: 1px solid var(--accent); border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 24px; }
.portal-app .feedback-banner strong { display: block; font-size: 14.5px; color: var(--accent-deep); }
.portal-app .feedback-banner span { display: block; font-size: 12.5px; color: var(--ink-muted); margin-top: 2px; }

.portal-app .fb-group { margin-bottom: 22px; }
.portal-app .fb-group:last-child { margin-bottom: 0; }
.portal-app .fb-group-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); margin: 0 0 12px; }
.portal-app .fb-question { margin-bottom: 16px; }
.portal-app .fb-question:last-child { margin-bottom: 0; }
.portal-app .fb-question label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.portal-app .fb-row { display: flex; gap: 8px; flex-wrap: wrap; }
.portal-app .fb-row button { min-width: 42px; height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; }
.portal-app .fb-row button.active { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
.portal-app .fb-submitted { display: flex; align-items: center; gap: 10px; padding: 14px; background: var(--success-bg); color: var(--success); border-radius: 10px; font-size: 13.5px; font-weight: 600; }

.portal-app :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

/* Skip-to-content link (UX review, 2026-07-28) — hidden off-screen until
   focused, then jumps a keyboard/screen-reader user straight past the rail
   nav to the main panel content instead of tabbing through every nav item
   on every page load. */
.portal-app .skip-link { position: absolute; left: -9999px; top: 0; z-index: 100; background: var(--accent); color: var(--accent-contrast); padding: 10px 18px; border-radius: 8px; font-size: 13.5px; font-weight: 600; text-decoration: none; }
.portal-app .skip-link:focus { left: 16px; top: 16px; }

@media (max-width: 860px) {
  .portal-app .app { flex-direction: column; }
  .portal-app .rail { display: none; }
  .portal-app .topbar { display: block; position: sticky; top: 0; z-index: 10; background: var(--rail-bg); color: var(--rail-fg); padding: 12px 16px; }
  .portal-app .topbar .row1 { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .portal-app .topbar .row1 .brand { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-size: 15px; font-weight: 600; }
  .portal-app .topbar .row1 .mark { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; object-fit: cover; }
  .portal-app .topbar .row1 button.logout { background: none; border: 1px solid var(--rail-line); color: var(--rail-fg); border-radius: 7px; padding: 6px 10px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .portal-app .topbar-nav { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
  .portal-app .topbar-nav button { flex-shrink: 0; background: none; border: 1px solid var(--rail-line); color: var(--rail-fg-muted); padding: 7px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .portal-app .topbar-nav button[aria-current="page"] { background: var(--rail-accent); color: var(--rail-bg); border-color: var(--rail-accent); }
  .portal-app .content { padding: 26px 18px 60px; }
  .portal-app .fig-grid { grid-template-columns: 1fr 1fr; }
  .portal-app .fig-grid > div:first-child { grid-column: 1 / -1; }
}
`;
