# Domain Consolidation and WordPress Retirement

**Status:** Draft for founder decision (2026-09-04)
**Owner:** Knowsia Operations and Engineering
**Scope:** Move the Course Registration app to `knowsia.com`, move KnowsiaApp to `app.knowsia.com`, retire the WordPress site on the VPS, and keep every bit of domain authority and search ranking knowsia.com has earned.
**Supersedes:** the "one domain via path rewrite" mechanism of Doc 19 §4 II (the goal stands, the mechanism changes) and the paused `course-catalog-integration-plan.md` (the WordPress catalogue page becomes moot).
**Applies to both repos.** KnowsiaApp's PLAN.md carries a pointer to this document.

---

## 0. The one-paragraph version

Authority lives in the domain name, not in WordPress. As long as `knowsia.com` keeps answering, and every URL Google already knows about answers with a permanent redirect to the page that now holds that content, nothing is lost. What *does* lose rankings is a URL that starts returning 404, a redirect that dumps everything on the home page, or content that disappears without a successor. So the plan is: inventory every indexed URL, give each one a destination, build the destinations that do not exist yet, flip DNS only when the destinations are live, keep the redirects for at least a year, and watch Search Console for eight weeks. The two hardest items are the public **question pages** (the strongest organic asset on the site, and KnowsiaApp has no public equivalent yet) and the **email and nameservers that live on the same VPS** as WordPress.

---

## 1. What exists today (verified 2026-09-04)

### 1.1 DNS and hosting

| Name | Today | Note |
|---|---|---|
| `knowsia.com` | A `64.20.36.232` (the VPS) | WordPress. Was down 2026-09-03; back up 2026-09-04. |
| `www.knowsia.com` | CNAME → `knowsia.com` | |
| `reg.knowsia.com` | CNAME → Vercel (`course-registration`) | Live registration app. |
| `app.knowsia.com` | no record | Free to use. |
| `knowsia-study.vercel.app` | Vercel (`knowsia-study`) | KnowsiaApp frontend, served under `/learn`. |
| API | `knowsia-api-production.up.railway.app` | Railway. No custom domain. |
| `quiz.knowsia.com` | CNAME → `knowsia-quiz-app.web.app` (Firebase) | The Knowsia Quiz App (`E:\WBRQ_QUIZ_APP`). **Currently a redirect loop** (301 to itself, verified 2026-09-04) because a bare CNAME is not a connected Firebase custom domain; the app itself works at knowsia-quiz-app.web.app. Fix by adding the domain in the Firebase console and using the A records it issues. |
| `mail.knowsia.com`, `ftp.knowsia.com` | A / CNAME → the VPS | CyberPanel (port 8090 answers) with Roundcube webmail at `mail.knowsia.com`. |
| Nameservers | `ns1/ns2.knowsia.com`, `ns1–3.noohrabusiness.com` | **Self-hosted on the same VPS.** When the VPS went down, DNS went with it, which is why the emergency Vercel redirect of 2026-09-03 never took effect. TXT queries against them time out, so SPF/DKIM/DMARC could not be read remotely. |
| Mail | **Confirmed on the VPS**: `MX 10 knowsia.com` → `64.20.36.232` | `info@knowsia.com` dies with the VPS. Mail hosting must move before Phase 4 (§9). |

`knowsia.com` is already added to the Vercel team but is not configured: Vercel is waiting for `A knowsia.com 76.76.21.21`.

### 1.2 WordPress footprint (Rank Math sitemap index, 13 child sitemaps)

Exact counts from the sitemaps downloaded on 2026-09-04 into
`scripts/seo/inventory/2026-09-04/` (`counts.tsv`, `all-urls.txt` = **787 unique URLs**):

| Content | Count | URL pattern | Value |
|---|---|---|---|
| Pages | 49 | `/about/`, `/live-programmes/`, `/verify/`, `/qb/`, `/courses/`, `/webinars-and-cpds/`, `/become-a-tutor/*`, `/affiliate*`, `/community/*`, `/shop/`, … | Brand and navigation pages; a few rank for brand queries. |
| Blog posts | 85 (+6 category archives) | `/{slug}/` at the root, plus `/blog/` | Long-tail ICAG and accounting-career content, 2024-02 → 2026-02. Real organic value. **Decision: import all.** |
| LearnDash courses | 21 (+7 course categories, 2 tags) | `/courses/{slug}/` — ICAG papers (`2-1-financial-reporting` …) plus Excel, payroll, Sage | Self-paced courses; some have paying students. **Decision: import all into M2.** |
| LearnDash lessons | 385 (two sitemaps) | `/lessons/lesson-231/` | Gated internals, negligible SEO value. Redirect to the parent course. |
| LearnDash topics, quizzes, exams | 93 topics, 108 quizzes, 1 exam | `/quizzes/quiz-29/`, `/topics/…` | Same. |
| WooCommerce products and categories | 25 products, 10 categories | `/product/…`, `/product-category/…` | Payment plumbing, not content. |
| **Question bank (custom post types, NOT in the sitemap)** | **"500+" per the site's own banner; exact count needs the WP admin export (Task M8.1). Public listing is throttled to 5 results per page, so it cannot be crawled from outside.** | `/question/{slug}/`, `/topic/{slug}/`, `/question-tag/{slug}/`, `/tag-sq/{slug}/`, `/sq/`, `/cs/`, `/qb/` | **Highest-value organic asset.** Google indexes them (verified: e.g. `/question/at-nov-2016-l3-q5d-international-taxation/`). Question text and metadata are public; full answers gated behind login. This is the exact model KnowsiaApp must reproduce. |
| Media | unknown | `/wp-content/uploads/…` | Images embedded in posts and hot-linked from social; must keep resolving. |

The `/live-programmes/` page already runs the `knowsia-programmes` plugin and renders the four live cohorts with register links into `reg.knowsia.com/register?batchId=…`. So the slug chosen was `live-programmes`, not `programmes`.

### 1.3 The Course Registration app's public surface

`/`, `/programmes`, `/programmes/{code}`, `/register`, `/news`, `/news/{category}`, `/news/article/{slug}`, `/partners/apply`, `/verify`, `/verify/{cert}`, `/r/{code}` (short links), the four portals, `/login`. `robots.ts`, `sitemap.ts` and `metadataBase` all derive from `NEXT_PUBLIC_APP_URL` (default `https://reg.knowsia.com`). **23 hard-coded `reg.knowsia.com` strings in 18 files** — ICS invites, receipt/invoice/statement PDFs, unsubscribe links, verify pages, the cron worker, the home page canonical.

`next.config.ts` currently carries the **emergency host redirect** `knowsia.com → reg.knowsia.com` (307). It must be deleted before knowsia.com points at Vercel, or the two host redirects loop.

### 1.4 KnowsiaApp's public surface

`/catalogue`, `/privacy-policy`, login/register/reset. **Every question page requires login** (`require_student`), and the frontend has no public question, topic or tag page and no sitemap. Served under `basePath /learn` for the reg.knowsia.com rewrite.

---

## 2. Principles that protect authority

1. **Same domain, so no "change of address".** Google's domain-move penalty risk does not apply; this is a platform change under a stable domain. The rules that matter are the redirect rules below.
2. **Every indexed URL gets a 301 to its closest equivalent.** Never a blanket redirect to the home page — Google treats that as a soft 404 and drops the page. Where no equivalent exists, redirect to the nearest section page (e.g. a lesson → its course's successor).
3. **Content parity before cutover.** A destination must exist and return 200 before its source is redirected.
4. **One canonical per page.** While two hosts serve the same content (transition), the non-canonical one 301s, it does not merely carry a canonical tag.
5. **Permanent (301/308), never temporary (307).** The emergency 307 is the one exception and it goes away at cutover.
6. **Redirects are forever.** Minimum 12 months; in practice keep them as long as the app exists. `reg.knowsia.com` stays as an alias forever because it is printed on certificates, receipts, QR codes and ICS invites.
7. **Measure.** Search Console before, during and after. Rankings dip 2–4 weeks after a migration and recover if the redirects are right; you cannot tell "normal dip" from "broken" without the baseline.
8. **Do not retire the VPS until nothing points at it** — DNS, mail, media and the question pages included.

---

## 3. Target architecture

```
knowsia.com            → Vercel · course-registration (Next.js)
                          marketing home, /programmes, /register, /news, /verify,
                          portals, redirect map for every old WordPress URL
www.knowsia.com        → 301 → knowsia.com (same path)
reg.knowsia.com        → 301 → knowsia.com (same path), kept indefinitely
app.knowsia.com        → Vercel · knowsia-study (Next.js, NO basePath)
                          question bank, mock exams, LMS, study plan
                          public, indexable question / topic / tag pages + sitemap
api.knowsia.com        → (optional, later) Railway knowsia-api custom domain
legacy.knowsia.com     → the VPS, read-only, 60–90 days after cutover, then gone
DNS                    → Cloudflare (DNS-only, grey cloud for Vercel records)
Mail                   → wherever it is confirmed to live; must survive the VPS
```

Why a subdomain for the study app rather than the `/learn` rewrite: the rewrite chains two Vercel projects in front of Railway, needs a basePath, and has already produced the unstyled-page, redirect-loop and cache-leak incidents of 2026-08-23. A subdomain has none of that, deploys independently, and Google treats subdomains of the same registrable domain as one site for most purposes. The cross-host handoff (Seam I) and PIN login work unchanged because they never depended on the shared host.

---

## 4. URL map (every source needs a destination)

The full map is generated, not typed (§5, Phase 2, item 8). This table fixes the *rules*.

| WordPress source | Destination | Precondition |
|---|---|---|
| `/` | `knowsia.com/` (reg home) | none |
| `/live-programmes/`, `/training/`, `/icag-live-tuition/`, `/free-icag-tuition/` | `/programmes` | none |
| `/esg-sustainability-reporting-training/`, `/global-internal-audit-standards/`, `/future-ready-skills/` | `/programmes/{code}` of the matching live programme, else `/programmes` | map by hand (3 pages) |
| `/register/` | `/register` | none |
| `/verify/` | `/verify` | none |
| `/blog/` | `/news` | none |
| `/{post-slug}/` (103 posts) | `/news/article/{same-slug}` | **posts imported into the news system with slugs preserved** (Phase 2). Posts you decide not to keep → `/news`. |
| `/webinars-and-cpds/`, `/zoom-meetings/*` | `/programmes` (or `/news/category/webinars` if you keep the content) | decide |
| `/qb/`, `/sq/`, `/cs/` | `app.knowsia.com/questions` (public listing) | **public question listing exists** |
| `/question/{slug}/` | `app.knowsia.com/questions/{id}` public page | **M8 migration with `legacy_slug` + public question page** |
| `/topic/{slug}/`, `/question-tag/{slug}/`, `/tag-sq/{slug}/` | `app.knowsia.com/questions?topic=…` / `?tag=…` (public, indexable filter pages) | same |
| `/question-bank-pricing/` | `app.knowsia.com/pricing` (or the pricing section of `/catalogue`) | page exists |
| `/knowsia-ai/` | `app.knowsia.com/` marketing section for the AI tutor | page exists |
| `/courses/` | `app.knowsia.com/catalogue` | none |
| `/courses/{slug}/` (21) | the matching self-paced course on `app.knowsia.com/courses/{id}` where it exists, else `/catalogue` | course imported into M2 (or decision to drop) |
| `/lessons/*`, `/topics/*`, `/quizzes/*`, `/ld-exam/*` | the parent course's destination | derive from LearnDash export |
| `/become-a-tutor/*`, `/instructor-dashboard/` | `knowsia.com/tutor-portal` (or an "apply to teach" page) | decide |
| `/affiliate*` | `/partners/apply` | none |
| `/community/*` | `/` or a "community has moved" page | announce first |
| `/shop/`, `/product/*`, `/cart2/`, `/checkout2/`, `/my-account-2/`, `/payment-options/`, `/discounts/` | `/programmes` (commerce) or `app.knowsia.com/pricing` (subscriptions) | none |
| `/student-dashboard/`, `/account-access/`, `/activate/`, `/join/` | `app.knowsia.com/login` | none |
| `/about/`, `/contact-2/`, `/testimonials/`, `/privacy-policy/`, `/terms-and-conditions/` | `/about`, `/contact`, `/testimonials`, `/privacy-policy`, `/terms` on knowsia.com | **pages to build** (or fold into the home page and redirect to anchors) |
| `/excel-templates/` | a downloads page or `/news` | decide |
| `/qr-code/`, `/jump-to/` | `/` | none |
| `/wp-content/uploads/*` | `knowsia.com/legacy-media/*` served from R2/Supabase storage | media exported and re-hosted |
| `/feed/`, `/?s=`, `/wp-login.php`, `/wp-admin/*` | 410 Gone (feed → `/news/feed` if the news system has one) | none |

Rules for the generator: strip trailing slash, case-insensitive, `www` → apex, never chain (source → final destination in one hop), one entry per URL in the Rank Math sitemaps plus every URL Search Console reports as having impressions in the last 16 months.

---

## 5. Phases and checklists

### Phase 0 — Safeguards and baseline (before touching anything)

- [ ] **Search Console.** Add a *Domain* property for `knowsia.com` (DNS TXT record), which covers every subdomain and protocol. Export: Performance → last 16 months, pages and queries; Links → top linked pages; Coverage → indexed pages. This export IS the priority list for the redirect map. *(founder — §10 step 1)*
- [ ] **Analytics baseline.** Whatever is installed (GA4?), export the last 12 months of landing pages. *(founder)*
- [ ] **Full WordPress backup**: database dump + `wp-content/uploads` + the WordPress XML export (Tools → Export → All content). Store off the VPS. *(founder — §10 steps 2–3)*
- [x] **Public URL inventory** — all Rank Math sitemaps saved, 787 URLs (`scripts/seo/inventory/2026-09-04/`).
- [ ] **Inventory the question bank** (this is PLAN.md Task M8.1 in KnowsiaApp): count `question` posts and every custom taxonomy term (`topic`, `question-tag`, `tag-sq`), count images inside them, and export them. Record the counts here. *(needs the WP export — §10 step 2; the agent does the counting)*
- [x] **Find where email lives.** MX → the VPS. Mail must move before Phase 4 (§9).
- [ ] **Move authoritative DNS off the VPS** to Cloudflare (free). Zone draft ready at `scripts/dns/knowsia.com.zone`; TXT records to be copied from CyberPanel. Import, set DNS-only, switch nameservers at the registrar. *(founder — §10 steps 4–6; agent verifies afterwards)*
- [x] **Founder decisions** taken (§7).

### Phase 1 — `app.knowsia.com` (no SEO exposure, can happen this week)

- [ ] Vercel `knowsia-study` → Settings → Domains → add `app.knowsia.com`. Cloudflare: `CNAME app → cname.vercel-dns.com` (DNS only).
- [ ] KnowsiaApp frontend `next.config.ts`: remove `basePath: "/learn"` and the `NEXT_PUBLIC_BASE_PATH` env. `lib/base-path.ts` keeps working with an empty base. Search the frontend for any remaining literal `/learn`.
- [ ] Vercel `knowsia-study` env: `COURSE_REG_PUBLIC_URL=https://knowsia.com` (after Phase 3; `https://reg.knowsia.com` until then), `KNOWSIA_API_URL` unchanged.
- [ ] Railway `knowsia-api`: add `https://app.knowsia.com` to the config-driven CORS origins (only matters if the browser ever calls the API directly; today it goes through the frontend proxy).
- [ ] Course Registration Vercel env: `KNOWSIA_APP_FRONTEND_URL=https://app.knowsia.com`; the `/learn/:path*` rewrite becomes a **308 redirect** to `https://app.knowsia.com/:path*` (existing `/learn` links keep working). `KNOWSIA_APP_URL` (handoff target) → `https://app.knowsia.com/auth/handoff`.
- [ ] Verify: PIN login, handoff from the portal, catalogue → register link, admin imports page, cookies set on `app.knowsia.com` only.
- [ ] Docs: Doc 19 §4 II amended (this document), KnowsiaApp CLAUDE.md "Deployment" and PLAN.md START HERE.

### Phase 2 — Content parity and code changes (the long pole)

Course Registration app (**built 2026-09-04, uncommitted, ships dark**):
- [x] Host env-driven everywhere: `lib/app-url.ts` (`appUrl()`, `appHost()`) replaces every literal `reg.knowsia.com` in code — home canonical, `metadataBase`, programme pages, verify pages, portal certificate line, tutors screen, ICS description, the three PDF footers, unsubscribe links, robots and sitemap. Default stays `https://reg.knowsia.com` until `NEXT_PUBLIC_APP_URL` flips. Deliberately unchanged: the ICS `UID` domain (`@reg.knowsia.com` is an identifier calendars match on, not a link), the cron worker's `APP_BASE_URL` default (its own Cloudflare env — set it at cutover), and the tutorial recorder's default.
- [x] Host redirects in `next.config.ts`, gated on `CANONICAL_HOST`: unset → only the emergency `knowsia.com → reg` 307 (unchanged production behaviour); set → `www.` and `reg.` 308 to the canonical host, path preserved, emergency rule gone. Logic in `config/host-redirects.mjs`, tests in `tests/unit/host-redirects.test.ts`. `RETIRE_PROGRAMMES_REDIRECT` and its two companions deleted.
- [x] `/learn` handling for Phase 1: `KNOWSIA_APP_PUBLIC_URL` turns the rewrite into permanent redirects (`/learn` → `/catalogue`, `/learn/*` → same path on the study host).
- [x] Redirect map generator: `npm run seo:redirects` (`scripts/seo/build-legacy-redirects.mjs`, rules in `legacy-url-map.mjs`, tests in `tests/unit/legacy-url-map.test.ts`) reads the sitemap inventory and writes `config/legacy-redirects.json` — **789 entries today**: 593 LearnDash internals → catalogue, 84 posts → `/news` (until `--blog-imported`), 34 commerce → `/programmes`, 33 hand-mapped pages, 20 courses → catalogue (until `--courses <map>`), 7 pages → study platform, 8 pattern rules. Zero unmapped pages. Flags `--question-pages-live`, `--questions <map>`, `--media-hosted` unlock the rest as the work lands. Applied by `next.config.ts` only when `CANONICAL_HOST` is set.
- [x] **One hop, measured.** Every WordPress URL ends in "/", and Next's built-in trailing-slash redirect ran before the custom map, so a production build showed `/live-programmes/` → 308 `/live-programmes` → 308 `/programmes` (two hops on every legacy URL). Fix: `skipTrailingSlashRedirect: true` in `next.config.ts` so the map matches `/x/` directly, and `middleware.ts` now runs on every page path to restore the canonical 308 (`/programmes/` → `/programmes`) for everything the map does not claim; the staff-auth logic inside it is unchanged and still gated to the staff prefixes. Verified on a local server: legacy slash URLs → one 308 to the destination; ordinary slash URLs → one 308 to their canonical path; API routes untouched. Tests in `tests/unit/middleware-trailing-slash.test.ts`.
- [x] Redirect checker: `npm run seo:check -- --host https://knowsia.com --expect config/legacy-redirects.json` walks every inventory URL, fails on any 404, chain longer than one hop, temporary redirect, or wrong destination, and writes `redirect-check.csv` next to the inventory.
- [x] `sitemap.ts` now lists published news articles with `lastModified`; `/verify` added.
- [x] Pages WordPress had and this app lacked — **built 2026-09-04** in the marketing design system, with a shared `MarketingFooter`:
  - `/about` — the founder's copy from knowsia.com/about/, trimmed to what this platform offers (the parent consultancy's service lines and "coming soon" features left out; team and values kept).
  - `/contact` — the app's own phone/WhatsApp/email plus the existing `EnquiryForm`, so a message lands in the leads queue.
  - `/privacy-policy` — **rewritten 2026-09-04** (version 2.0) in `app/(public)/privacy-policy/content.ts` to describe what the two platforms actually do: the registration fields, Paystack and bank-slip payments, Resend/WhatsApp/SMS, the Vapi voice assistant and its transcripts, GA4/Meta Pixel on public pages, the 30-day attribution cookie, Sentry scrubbing, Zoom recordings under BR-24, AI use under BR-25, certificate verification, anonymisation on deletion (BR-16), the full processor list, transfers, retention, rights under Act 843 and the DPC complaint route, and app.knowsia.com's data. The WordPress text (Stripe, Akismet, Turnitin, forums) is gone. **Before it goes live** the founder and a Ghanaian data-protection practitioner must work through `PRIVACY_REVIEW_NOTES` in that file: the DPC registration number and registered address (entity confirmed 2026-09-04 as **Knowsia Professional Institute**; the About page and KnowsiaApp's own page now say the same), AI-provider training terms, the proposed retention periods (nothing purges on a schedule yet), recording consent in practice, whether GA4/Pixel are actually enabled, contact details, and pointing app.knowsia.com's own June 2026 page at this one.
  - Not built, by inspection of the live pages: `/testimonials` is untouched theme placeholder text (lorem ipsum, fictitious names) → redirects to `/`; `/terms-and-conditions` is an affiliate-programme template ("NBC Institute", US-resident affiliates, US law) → redirects to `/partners/apply`, whose programme replaces the affiliate scheme (§7 decision 5). A real terms page for registrants is a separate, founder-authored task.
- [ ] **Blog import**: write the 85 posts into the news system (Doc 17) preserving slug, title, publish date, featured image and body. The pipeline's article shape is sectioned news, not free-form prose, so this needs a `body_html` (or legacy-body) column and a renderer branch on `/news/article/{slug}`. Source of truth: the WordPress database dump (Phase 0 step 2). Then regenerate with `--blog-imported`.
- [ ] Legacy media: copy `wp-content/uploads` to object storage; serve at `/legacy-media/*`; regenerate with `--media-hosted`.
- [ ] LearnDash course map (`--courses`) once the 21 courses exist in M2.

KnowsiaApp (this is where the SEO risk actually lives):
- [ ] **Public question page**: `app.knowsia.com/questions/{id}` renders question text, paper, level, series, topic and marks without login; answer and explanation stay behind the tier gate — exactly WordPress's current model, which is what earned the rankings. `Question` structured data (`schema.org/Question`) with the answer omitted or truncated for gated users.
- [ ] **Public listing and filter pages** `/questions`, `/questions?topic=…`, `/questions?paper=…` indexable, with proper `<title>`/description and canonical (the reg app's catalogue page is the template for tone).
- [ ] **Sitemap and robots** on `app.knowsia.com` covering questions, topics, catalogue.
- [ ] **M8 migration** of the WordPress question bank into `m3_questions` with a `legacy_slug` (or a `migration_redirects` table) so every `/question/{slug}/` maps to a real id. Quality gate as already specified (BR-MIG-01: nothing published without admin approval).
- [ ] Decide the fate of the 21 LearnDash courses: import the ones with paying students into M2 (Bunny Stream), redirect the rest to `/catalogue`. Communicate to those students (M8.4).

### Phase 3 — Cutover `knowsia.com` → Vercel

Preconditions: Phase 0 complete; Phase 2 destinations live and returning 200 on `reg.knowsia.com` (they work on any host); redirect map deployed dark; question pages public on `app.knowsia.com` **or** the founder has accepted the interim in §6.

- [ ] Add `knowsia.com` and `www.knowsia.com` to the `course-registration` Vercel project (already attached to the team).
- [ ] **Rehearse with a hosts-file override**: point `knowsia.com` at `76.76.21.21` on one laptop, set `CANONICAL_HOST` in a preview, and walk the redirect map with a script: every old URL must return one 301 to a 200 page, no chains, no 404s. Fix before flipping.
- [ ] Set `NEXT_PUBLIC_APP_URL=https://knowsia.com` and `CANONICAL_HOST=knowsia.com` in Vercel production; redeploy (dark until DNS moves).
- [ ] Flip DNS in Cloudflare: `A knowsia.com → 76.76.21.21`; `CNAME www → cname.vercel-dns.com`. Keep the VPS reachable as `legacy.knowsia.com` (A record to `64.20.36.232`) for 60–90 days, with WordPress set to `noindex` and search-engine visibility off, so nothing on it competes with the new site.
- [ ] Immediately after: run the redirect-walk script against the live host; fix any 404 within the hour.
- [ ] Update everything that stores the host: Supabase Auth Site URL and redirect allow-list; Google Cloud OAuth authorised redirect URIs (add `knowsia.com`, keep `reg.knowsia.com`); Paystack callback/webhook URLs; Resend templates; Arkesel/WhatsApp message templates that embed links; Vapi; Sentry; the Cloudflare cron worker's `APP_BASE_URL`; the WordPress plugin is now dead so nothing to do there.
- [ ] Search Console: submit `https://knowsia.com/sitemap.xml` and `https://app.knowsia.com/sitemap.xml`; use URL Inspection → Request indexing on the top 20 landing pages from the Phase 0 export.
- [ ] Watch weekly for 8 weeks: Coverage (404s, soft 404s, redirect errors), Performance (clicks on the old top pages vs baseline), Core Web Vitals. A 10–20 % dip in weeks 2–4 is normal; a page losing all impressions means its redirect is wrong.

### Phase 4 — Retire the VPS

- [ ] Only after: MX/email confirmed off the VPS; nameservers on Cloudflare; 90 days of stable Search Console data; the legacy media served from storage; question pages migrated.
- [ ] Final backup, then power down. Keep the backup for a year.
- [ ] Remove `legacy.knowsia.com`. Keep every redirect.

---

## 6. The question-bank interim (decide before Phase 3)

The `/question/{slug}/` pages are the reason knowsia.com ranks for exam-question queries, and KnowsiaApp cannot serve them today. Three options:

| Option | What happens | Verdict |
|---|---|---|
| **A. Sequence it** — finish the public question pages and M8 migration first, then flip | No interim, no ranking risk, but cutover waits on the biggest piece of work | **Recommended** if the VPS is stable enough to wait 4–6 weeks. |
| **B. Proxy the long tail** — flip now; `next.config.ts` rewrites `/question/*`, `/topic/*`, `/question-tag/*`, `/tag-sq/*`, `/qb/`, `/sq/`, `/cs/` to `https://legacy.knowsia.com/...` until migrated | knowsia.com keeps answering those URLs (200, same content) with the VPS behind it; everything else moves now. WordPress must be told its home URL is still `https://knowsia.com` (it is), and the legacy host must not be indexed on its own | Workable and reversible. Same pattern as the `/learn` rewrite, with the same class of risks (asset paths, cookies). Choose it if the marketing-site move cannot wait. |
| **C. Redirect the lot to `app.knowsia.com/questions`** | Rankings for individual questions are lost; the section-level authority is partly retained | Not recommended. This is the "blanket redirect" failure mode. |

---

## 7. Founder decisions — TAKEN 2026-09-04

1. **Blog**: import **all 103 posts** into the news system, slugs preserved.
2. **Question pages**: **public question, gated answer** on `app.knowsia.com`; **§6 option A** — finish the public question pages and the M8 migration *before* flipping `knowsia.com`. The cutover date is therefore set by KnowsiaApp Phase 2, not by the marketing site.
3. **LearnDash courses**: **import all 21 into M2**; some have paying students, so enrolments and remaining access periods must be carried over (M8.4 communication applies).
4. **DNS**: **move to Cloudflare now.** Email: the MX record points at the VPS itself (`knowsia.com`, priority 10, `mail.knowsia.com` → `64.20.36.232`), so **mail hosting must be moved before Phase 4** — see §9.
5. **Community and affiliates**: **replace with the partner programme** in this app (`/partners/apply`, partner portal). Announce to existing affiliates before the redirect goes live.

---

## 8. What NOT to do

- Do not flip `knowsia.com` to Vercel while the emergency 307 is still in `next.config.ts`.
- Do not redirect old URLs to the home page "for now".
- Do not turn on `RETIRE_PROGRAMMES_REDIRECT` — that flag sends `/programmes` to WordPress, the opposite of this plan; delete it in Phase 2.
- Do not use Cloudflare's orange-cloud proxy in front of Vercel; DNS-only.
- Do not shut the VPS until email, DNS, media and the question pages have moved.
- Do not use 307/302 for anything except the transition rewrite in option B.
- Do not let `reg.knowsia.com` stop resolving, ever; certificates and receipts carry it.

---

## 9. Mail hosting must move (new gating item)

`MX 10 knowsia.com` → `64.20.36.232`: every message to `@knowsia.com` is delivered to the VPS (CyberPanel, Roundcube at `mail.knowsia.com`). Retiring the VPS without moving mail cuts off `info@knowsia.com`, which is also the sender identity behind Resend and the contact address on every marketing page.

Options, cheapest first:
1. **Cloudflare Email Routing** (free) forwards `info@knowsia.com` to an existing mailbox (e.g. a Gmail/Workspace address). Receive-only; sending as `info@` then needs Resend (already in use) or Gmail "send as" with SMTP. Adequate if the mailbox is only read by one or two people.
2. **Google Workspace** (paid per seat) — real mailboxes, calendar, the account the founder already signs in with. Migrate mail with Google's IMAP migration tool from the VPS before shutdown.
3. **Zoho Mail** — cheaper per seat, same shape as 2.

Whichever is chosen: create the new MX/SPF/DKIM/DMARC records in Cloudflare **alongside** the VPS records first, migrate mailboxes, switch MX, then run 30 days before Phase 4. Nothing in this document proceeds to Phase 4 until mail is confirmed off the VPS.

---

## 10. Phase 0 status (2026-09-04) — what is done, and the parts only the founder can do

Done by the agent, without credentials:

- [x] DNS and hosting discovered (§1.1), including `quiz.knowsia.com` (Firebase), `mail`/`ftp`, the self-hosted nameservers, and the MX pointing at the VPS.
- [x] WordPress URL inventory captured: all 13 Rank Math sitemaps saved verbatim under `scripts/seo/inventory/2026-09-04/` with per-sitemap counts and a deduplicated `all-urls.txt` (787 URLs). This is the input to the redirect generator.
- [x] Cloudflare import draft written: `scripts/dns/knowsia.com.zone` — every observed record, with the Phase 1/3 changes and the TXT records still to be copied from CyberPanel marked.
- [x] Founder decisions recorded (§7).

Cannot be done without the founder's accounts — each is a few minutes:

1. **Search Console (15 min).** search.google.com/search-console → Add property → *Domain* → `knowsia.com` → copy the TXT value into the zone draft (and into CyberPanel DNS now, so it verifies today). Then Performance → date range *Last 16 months* → Export (pages, and again for queries); Links → Export external links; Pages (indexing) → Export. Save all four CSVs into `scripts/seo/inventory/2026-09-04/gsc/`. The agent turns them into the priority list.
2. **WordPress export (10 min).** wp-admin → Tools → Export → *All content* → download the XML; save it as `scripts/seo/inventory/2026-09-04/wordpress-export.xml` (it is large; do not commit it, it is gitignored). Also Rank Math → Redirections → Export (if any exist). The XML is what gives the exact question count and every slug.
3. **Full backup (CyberPanel, 5 min to start).** CyberPanel → Backup → Create Backup for `knowsia.com` (site files + database + emails). Download it off the VPS. This is insurance, not a migration input.
4. **Copy the mail DNS records (5 min).** CyberPanel → DNS → knowsia.com → note every TXT (SPF, DKIM `default._domainkey`, DMARC) and any record not in `scripts/dns/knowsia.com.zone`. Paste them into the zone file (or send them to the agent).
5. **Cloudflare (20 min).** Sign up / sign in → Add a site → `knowsia.com` → Free plan → skip the scan → DNS → Import and Export → Import `scripts/dns/knowsia.com.zone` → set **every** record to DNS-only (grey cloud). Add the Search Console TXT and the Vercel `_vercel` TXT when you have them. Cloudflare then shows two nameservers.
6. **Registrar (5 min, then up to 24 h).** At the domain registrar, replace `ns1/ns2.knowsia.com` and the noohrabusiness nameservers with the two Cloudflare nameservers. Nothing changes for visitors because the records are identical; the only effect is that DNS no longer depends on the VPS.

After step 6, tell the agent: it will verify every record resolves identically from Cloudflare, then start Phase 1.

---

## 11. Success criteria

- 100 % of URLs in the Rank Math sitemaps and the Search Console export return exactly one 301 to a 200 page (scripted check, kept in `scripts/`).
- Search Console clicks for the top 50 pre-migration landing pages recover to ≥ 90 % of baseline within 8 weeks.
- Zero soft-404 or redirect-error entries for old URLs after week 2.
- `knowsia.com`, `www`, `reg`, `app` all HTTPS, `www` and `reg` 301 to apex.
- Email to `info@knowsia.com` unaffected throughout.
- VPS powered off, backups retained, redirects still live.
