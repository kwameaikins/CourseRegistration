# Project: Live Course Catalog Integration (reg.knowsia.com → knowsia.com)

> ## ⚠️ AMENDMENT — 2026-08-17. This project is PAUSED.
>
> **Founder decision: reg.knowsia.com gets its own public home page, and the
> knowsia.com migration waits.** The reason is sequencing, not a reversal —
> knowsia.com is to be reworked once the question bank and the AI tutor are
> finished, and doing the catalogue migration now would mean doing it twice.
>
> **What changed**
>
> - `app/page.tsx` is now a public marketing home page. It used to redirect
>   anonymous visitors to the staff sign-in. Staff behaviour is unchanged —
>   a signed-in staff member still lands on their role's default screen.
> - This app therefore no longer keeps "only the transactional surface". The
>   sentence to that effect in `next.config.ts` is superseded by this note.
>
> **What this forces, and must not be forgotten**
>
> 1. **`RETIRE_PROGRAMMES_REDIRECT` must stay OFF.** `/programmes` is now the
>    home page's primary destination. Switching the 301 on would bounce every
>    visitor who clicks the main call to action off the domain — and into a 404
>    while the WordPress side is undeployed. The flag was already gated for a
>    different reason; it now has two.
> 2. **The duplicate-content question is deferred, not answered.** knowsia.com
>    still has its own home page. Two live home pages on two domains compete for
>    the same brand queries. That was acceptable to the founder for now because
>    knowsia.com is being reworked anyway, but it is the first thing to settle
>    when this project resumes.
> 3. **The WordPress plugin stays written and undeployed.** Nothing about it
>    changes; `wordpress/knowsia-programmes/` is still correct and still the
>    intended destination. It simply waits.
>
> **When this project resumes**, decide the canonical home page first, then the
> catalogue. The cutover sequence at the end of this document is unaffected and
> still applies.
>
> ---
>
> **BUILD STATUS — 2026-08-05.** Founder decision: **knowsia.com becomes the canonical
> catalogue, and reg.knowsia.com/programmes is retired via 301 redirect.**
>
> | Phase | Status |
> |---|---|
> | 1 — Public catalog API | **Built and verified** against the live database |
> | 2 — WordPress fetch/cache | **Written, not deployed** — `wordpress/knowsia-programmes/` (I have no knowsia.com access) |
> | 3 — Templates | **Written** as part of the same plugin (catalog grid + detail page) |
> | 4 — Fallbacks | **Built into the plugin** (two-tier transient cache, last-good fallback) |
> | 5 — SEO | **Built into the plugin** (per-programme title/description, canonical, `Course`+`CourseInstance` JSON-LD) |
> | Retirement redirect | **Written but INERT** — gated behind `RETIRE_PROGRAMMES_REDIRECT` |
>
> **Do not enable the redirect until knowsia.com/programmes is live and verified.** Turning it
> on early 301s real visitors into a 404, and browsers cache 301s aggressively. See
> "Cutover sequence" at the end of this document.
>
> Verified live against the production database on 2026-08-05: 4 programmes returned
> (AI02, ESG1, ESG2, ERM1), correct 401 without/with a wrong key, 404 on an unknown code,
> case-insensitive lookup, and `Cache-Control: s-maxage=30, stale-while-revalidate=60`.
>
> **Finding worth acting on: 3 of the 4 live cohorts have no capacity set**, so
> `seatsRemaining` is `null` (uncapped) for them and no seat count will render on knowsia.com.
> The "live seat counts" premise of this project is therefore mostly inert today. If seat
> scarcity is meant to drive urgency, set `capacity` on those batches in the portal — no code
> change needed.

> **Revision 2 — 2026-08-05.** Revision 1 was written from external research only (fetching
> the two sites from outside), without access to the reg.knowsia.com codebase. This revision
> corrects it against the actual source. Three things changed materially:
>
> 1. **reg.knowsia.com is not a private internal tool.** It already serves several public,
>    unauthenticated pages — including a live course catalogue at `/programmes`.
> 2. **`GET /api/courses` already exists and is staff-authenticated.** The proposed public
>    endpoint would have collided with it head-on.
> 3. **The data model is Course → many Batches**, not one flat course record. The proposed
>    JSON schema cannot represent it.
>
> Phase 1 is consequently much smaller than estimated. Phases 2–5 (WordPress side) are
> unchanged in substance — I have no access to knowsia.com and have not verified anything
> there, so treat all WordPress findings below as still coming from external research.
>
> **Verification pass — 2026-08-05.** Every reg.knowsia.com claim above and below was re-checked
> against the source. All findings held except three, now corrected in place:
>
> - The `/programmes` filter is on *having* sessions (`sessions.length > 0`), **not** on having
>   *open* ones — a fully-booked programme still shows, and should, because it routes to the
>   waitlist. Phase 1's filter task and acceptance criteria were reworded.
> - There is **no `summary` field**. Marketing copy is a `CoursePublicContent` object exposed as
>   `content`, and it is `null` for any course without founder-written copy. The schema now maps
>   `summary` ← `content.tagline` and flags the null case for the WordPress template.
> - CORS covering only the apex domain would break on `www`. Both hosts are now specified.

## Context

- **knowsia.com** — Main marketing site, built on WordPress. Has SEO authority and is where non-technical staff edit content.
- **reg.knowsia.com** — Custom registration/course management portal, built on **Next.js**. Source of truth for course data (seats, pricing, status).
- **Goal** — Build a course catalog page on knowsia.com (WordPress) that displays **live** course data (seats available, pricing, status) pulled from reg.knowsia.com via API, with "Register" buttons linking out to the portal to complete signup.

## Why this architecture

- Live seat counts and pricing must come directly from the reg.knowsia.com database — no manual syncing, no stale data.
- knowsia.com keeps its SEO authority and content flexibility by hosting the catalog page itself (via API pull) rather than redirecting visitors to a subdomain for browsing.
- reg.knowsia.com stays focused on registration/payment logic; it only needs to expose a clean read-only API.

---

## Findings from the reg.knowsia.com codebase (Revision 2 — verified in source)

### 1. reg.knowsia.com already has public pages, including a course catalogue

Revision 1 concluded the portal was entirely login-gated, based on fetching the root URL. That
observation was correct but the conclusion was not: `app/page.tsx` redirects **the root path
only** to `/login`, because the root is the staff dashboard entry point. `middleware.ts` gates
only staff routes; everything else is open.

Already public and unauthenticated today:

| Path | What it is |
|---|---|
| `/programmes` | **A live course catalogue** — server-rendered, branded, with SEO metadata |
| `/programmes/[courseCode]` | Per-programme detail page |
| `/register` | Public registration form (accepts `?batchId=` to pre-select a cohort) |
| `/news`, `/news/[category]`, `/news/article/[slug]` | Knowsia Insights public news site |
| `/verify`, `/verify/[certNumber]` | Public certificate verification |
| `/partners/apply`, `/r/[code]` | Partner application and tracked referral links |
| `GET /api/register/active-batches` | **Public unauthenticated JSON** of active batches |

**Implication — this is the biggest change to the project.** This is not "carving out the first
public surface of an internal tool." A public catalogue with live seats and pricing already
exists and is deployed. The work is to expose that same data as JSON for WordPress to consume.
The security bar is real but lower than Revision 1 assumed: the pattern for a public read is
already established (`/api/register/active-batches`), and there is already a purpose-built
public read model that touches no participant data.

**Decision this forces (raise with the stakeholder before Phase 3):** knowsia.com/programs and
reg.knowsia.com/programmes would show *the same course content on two domains*. That is textbook
duplicate content and it partly works against the SEO rationale for this project. Pick one:

- **(a)** WordPress becomes canonical; add `<link rel="canonical">` on the WordPress pages and
  either `noindex` the portal's `/programmes` or point its canonical at WordPress. Costs the
  portal's existing SEO but matches the project's stated intent.
- **(b)** The portal stays canonical; WordPress links to it rather than duplicating it. Cheapest
  and lowest-risk, but reduces this project to a nav/link change.
- **(c)** Differentiate the content so they are genuinely different pages (WordPress =
  marketing//long-form, portal = the transactional list). More work, best long-term.

Revision 1 did not surface this because it did not know `/programmes` existed. It needs an
explicit answer — the recommendation is **(a)** if the project proceeds as scoped.

### 2. `GET /api/courses` is already taken by a staff-authenticated endpoint

`app/api/courses/route.ts` exists today. `GET` requires a staff role
(`admin | finance | marketing | management`); `POST` is admin-only and creates courses.
`app/api/courses/[id]/route.ts` likewise.

**Implication:** the proposed public `GET /api/courses` and `GET /api/courses/{id}` **cannot be
built at those paths.** Adding public handlers there would either conflict with the existing
route or, worse, silently widen an authenticated admin surface.

**Use a separate, clearly-public namespace instead:**

```
GET /api/public/catalog                  → all published programmes
GET /api/public/catalog/{courseCode}     → one programme
```

The `/api/public/` prefix makes the trust boundary obvious in the file tree, which matters in a
codebase where every other route is gated.

### 3. The data model is Course → many Batches; the proposed schema cannot express it

A **Course** is the product (e.g. `AI05`, its name, certificate hours, CPD credit). A **Batch**
is one scheduled cohort of that course, and carries its own start/end dates, start time,
facilitator, fee, early-bird discount, capacity, and free/paid flag. One course routinely has
several open batches at once.

Revision 1's schema puts `startDate`, `price`, and `seatsAvailable` directly on the course. That
cannot represent two cohorts of the same programme at different prices — which is the normal
case here, not an edge case. It also has no room for:

- **Early-bird pricing.** Every batch has a list fee and an effective fee, where the effective
  fee applies only while `discount_cutoff_date` holds. The catalogue must publish both, or it
  will advertise a price the registration form won't honour.
- **Free events.** Batches carry an `is_free` flag; those need "Register for the free webinar"
  treatment, not a `0` price.
- **Uncapped batches.** `capacity` is nullable. `seatsRemaining` is `null`, not `0`, when a
  batch has no cap — the WordPress template must not render that as "0 seats left".

### 4. Most of Phase 1's data work already exists

`modules/courses/public-catalog.ts` already provides `getPublicCourseCatalog()` and
`getPublicCourseByCode()`. It is the read behind the existing `/programmes` pages and it already:

- merges founder-written marketing copy with live commercial facts from the database
- computes `effectiveFee` vs `listFee` including the early-bird cutoff
- computes `seatsRemaining` as `capacity − confirmedRegistrations`, clamped at zero, `null` when uncapped
- computes `isFull`, and picks a sensible `nextSession`
- **is deliberately uncached**, with this reasoning in the source: *"the price and the seat count
  on a marketing page have to be the same ones the registration form will honour, and a stale
  '3 seats left' is worse than a slower page"*
- excludes participant data entirely — it reads courses, batches, and a registration **count**

**Implication:** Phase 1 is a thin JSON serialisation layer over an existing, tested read model
(`tests/unit/public-catalog.test.ts` already covers it), plus auth/CORS. It is not a
from-scratch API build. Realistically **1–2 days**, not the ~1 week the original timeline implied.

### 5. Answers to Revision 1's open questions (items 1, 2, 3, 7 are now settled)

| # | Question | Answer from the codebase |
|---|---|---|
| 1 | Database/ORM? | Supabase (PostgreSQL) via `@supabase/supabase-js`. Strict layering: route → `modules/*/service.ts` → `modules/*/repository.ts`. A route must never query the DB directly. |
| 2 | Do slugs exist? | **Yes** — `course_code` (e.g. `AI05`, `ESG1`) is the slug, already used at `/programmes/[courseCode]` and matched case-insensitively. No generation needed. |
| 3 | Existing API key approach? | **Yes** — `CRON_SECRET` validated as `Authorization: Bearer <secret>` on the cron routes. Mirror that rather than inventing `x-api-key`. |
| 7 | Are seats/status computed? | **Computed, already.** `seatsRemaining = capacity − confirmedRegistrations` (clamped at 0; `null` when uncapped), plus an `isFull` boolean. No schema work needed. |

Still open, and genuinely needing a stakeholder decision: **4** (are detail pages in scope for
v1), **5** (WordPress host outbound HTTP), **6** (final public path and nav label), **8**
(cross-linking with LearnPress) — plus the **new** canonical/duplicate-content decision in
Finding 1 above.

---

## Site Research Findings (Revision 1 — knowsia.com, still unverified by me)

> I have no access to knowsia.com. The following is Revision 1's external research, retained
> as-is. Confirm before relying on it.

### knowsia.com already has an existing course system — this is a *different* one

- knowsia.com runs WordPress + Elementor, and its existing `/courses/` archive is powered by **LearnPress** (a WordPress LMS plugin), evidenced by:
  - Custom post type at `/courses/{slug}/` with pagination (`/courses/page/2/`, etc.)
  - Course-category taxonomy archives (`/course-category/professional-programs/`, `/course-category/certificate-courses/`)
  - Single-course pages showing "Current Status: Not Enrolled," "Price: Free," "Log In to Enroll" — classic LearnPress single-course template markup
  - Related infrastructure: Tutor/Instructor Dashboard, Affiliate Dashboard, "My Account" subscriptions
- **These are self-paced, unlimited-enrollment courses** (video/PDF/quiz-based). They are not the seat-limited, date-bound programs this project is about.
- There's also a separate `/zoom-meetings/{slug}/` custom post type powering the "Webinars and CPDs" page — a third, distinct content type on the same site.

**Implication:** The new live catalog **must not reuse the `/courses/` URL or post type**. Use a
distinct path (e.g. `/training-programs/`, `/live-programs/`). This plan uses `/programs` as a
placeholder — rename before build if the client prefers something else.

> Note the portal already calls these "programmes" (`/programmes`). Using **`/programs`** on
> WordPress keeps the vocabulary consistent across both properties, which also helps with the
> canonical decision in Finding 1.

### Business context

- Business is Ghana-based; pricing is in **GHS** — confirmed in the codebase (`formatGhs`).
- The WordPress site name is "Noohra Business Consult" (parent company), operating the Knowsia brand.

---

## Architecture Overview

```
[WordPress: knowsia.com]
   /programs        ──(server-side fetch, cached 30–60s)──►  [Next.js: reg.knowsia.com/api/public/catalog]
   /programs/{code} ──(server-side fetch)──────────────────►  [Next.js: reg.knowsia.com/api/public/catalog/{courseCode}]

   "Register" button ──(direct link, no API)──► reg.knowsia.com/register?batchId={batchId}
```

**The register link is per-batch, not per-course.** `/register` already reads `?batchId=` and
pre-selects that cohort on mount (built for referral links). A course-level link cannot express
"the March cohort", so the API returns a ready-made `registerUrl` per session and WordPress
should link to that verbatim rather than constructing URLs itself.

---

## Phase 1 — Public catalog API on reg.knowsia.com (Next.js)

**Revised scope: a serialisation + auth layer over the existing `getPublicCourseCatalog()`.**

### Tasks

1. `GET /app/api/public/catalog/route.ts` — array of programmes (schema below).
2. `GET /app/api/public/catalog/[courseCode]/route.ts` — one programme by course code, 404 if unknown.
   - Both delegate to `modules/courses/public-catalog.ts`. **No new database queries** — reuse
     `getPublicCourseCatalog()` / `getPublicCourseByCode()` so the API and the portal's own
     `/programmes` pages can never disagree.
   - Filter out programmes with **no scheduled sessions at all**, matching what `/programmes`
     already does — `allCourses.filter((course) => course.sessions.length > 0)` (founder
     decision 2026-08-04: never show a programme nobody can act on).
   - **Precisely:** the filter is on *having* sessions, not on those sessions being *bookable*.
     A programme whose only cohort is full still appears, and should — it routes to the
     waitlist. Do not "improve" this to filter on `!isFull` without asking; that would silently
     hide the waitlist funnel.
3. Auth: `Authorization: Bearer <CATALOG_API_KEY>`, mirroring the existing `CRON_SECRET` check.
   New env var; add to Vercel and to `.env.local.example`.
4. CORS: allow `https://knowsia.com` **and** `https://www.knowsia.com` (echo whichever the
   request's `Origin` matches — `Access-Control-Allow-Origin` takes a single value, not a list),
   plus an `OPTIONS` handler. Covering only the apex breaks the moment someone fetches from the
   `www` host.
   - Note this is defence-in-depth, not the real control. The call is server-to-server from
     WordPress via `wp_remote_get()`, where CORS does not apply at all. **The bearer token is
     the actual security boundary.**
5. Caching: `Cache-Control: s-maxage=30, stale-while-revalidate=60`.
   - This is a deliberate departure from the portal's own uncached posture. It is acceptable
     here because WordPress adds its own 30–60s transient cache on top anyway, so the data is
     already not real-time on that surface. **Consequence to accept explicitly:** a seat count
     on knowsia.com can lag reality by up to ~2 minutes across both caches, so a visitor can
     click Register on a cohort that just filled. `/register` already handles a full batch by
     routing to the waitlist, so this degrades safely — but the WordPress copy should not promise
     real-time accuracy.
6. Errors: reuse the app's existing `{ data, error: { code, message } }` envelope rather than the
   `{ "error": "message" }` shape in Revision 1 — every other endpoint in this app uses the former,
   and WordPress can read either.

### Data Schema (JSON) — revised for Course → Batch

```json
{
  "courseCode": "AI05",
  "courseName": "AI-Powered Financial Reporting",
  "summary": "string | null",
  "idealFor": "string | null",
  "certificateHours": 12,
  "cpdCredit": "string",
  "currency": "GHS",
  "isFreeProgramme": false,
  "detailUrl": "https://reg.knowsia.com/programmes/AI05",
  "sessions": [
    {
      "batchId": "uuid",
      "cohortLabel": "March 2026",
      "startDate": "2026-03-02",
      "startTime": "18:00",
      "endDate": "2026-03-06",
      "facilitatorName": "string",
      "isFree": false,
      "listFee": 1200,
      "effectiveFee": 950,
      "earlyBirdEndsOn": "2026-02-15 | null",
      "seatsRemaining": 7,
      "isFull": false,
      "status": "open | full",
      "registerUrl": "https://reg.knowsia.com/register?batchId={batchId}"
    }
  ]
}
```

**Where `summary` comes from.** There is no `summary` column. Marketing copy lives in
`modules/courses/public-content.ts` as a `CoursePublicContent` object per course code, and
`getPublicCourseCatalog()` exposes it as `content`, which is **`null` for any course the founder
hasn't written copy for**. The serialiser should flatten it:

| API field | Source | Notes |
|---|---|---|
| `summary` | `content.tagline` | A one-sentence promise; already used as the portal's own meta description, so it is written for exactly this purpose |
| `idealFor` | `content.idealFor` | Condensed audience line, written for the catalogue card |

Richer fields (`overview`, `outcomes`, `curriculum`, `format`, `primaryAudience`) also exist and
could feed a WordPress detail page — but if detail pages are out of scope for v1, do **not**
serialise them. Shipping unused payload invites WordPress to start depending on fields nobody
agreed to keep stable.

Notes for whoever builds the WordPress template:

- **`summary` and `idealFor` can be `null`** — a course with no founder-written copy still appears
  in the catalogue if it has a scheduled cohort. The card must render without a description
  rather than printing "null" or collapsing.
- `seatsRemaining: null` means **uncapped**, not zero — render nothing, not "0 seats left".
- `effectiveFee < listFee` means an early-bird price is live; show the strikethrough and the
  `earlyBirdEndsOn` deadline. Never show a discount without that date.
- `isFree: true` → suppress price entirely and use webinar wording.
- Revision 1's `waitlist` and `closed` statuses are not distinct states in the source data. A
  full batch routes to the waitlist through `/register` itself, so `status` is `open | full`;
  WordPress can label `full` as "Join waitlist".

### Acceptance Criteria — Phase 1

- [ ] `GET /api/public/catalog` returns every programme with at least one scheduled session
      (including programmes whose only cohort is full — those route to the waitlist)
- [ ] A programme with zero scheduled sessions is omitted entirely
- [ ] `GET /api/public/catalog/{courseCode}` returns one programme, 404 otherwise, case-insensitive
- [ ] Request without a valid bearer token → 401; with it → 200
- [ ] Response contains **no** participant, registration, payment, or staff data (assert in a test)
- [ ] `seatsRemaining` provably reflects a real registration (register someone, confirm it decrements)
- [ ] Uncapped batch serialises `seatsRemaining: null`, not `0`
- [ ] A batch with a live early-bird returns `effectiveFee < listFee` **and** a non-null `earlyBirdEndsOn`
- [ ] Existing `/programmes` pages and the new API return identical figures for the same batch
- [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all green

---

## Phase 2 — WordPress Integration

*(Unchanged from Revision 1 except the auth header and endpoint path. Not verified by me.)*

### Tasks

1. Build a small custom plugin that:
   - Calls the reg.knowsia.com API server-side using `wp_remote_get()`
   - Sends `Authorization: Bearer <key>` (**not** `x-api-key` — matches the portal's existing convention)
   - Caches the response using **WordPress transients**, TTL 30–60 seconds
   - Falls back to the last successfully cached response if the live call fails (never show a blank page)
2. Confirm the WordPress host allows outbound HTTP requests to reg.knowsia.com (test early — some hosts block this)
3. Store the API key in `wp-config.php` or an env-backed constant — **never** in the database or in a committed file
4. Log failed API calls for monitoring

### Acceptance Criteria — Phase 2

- [ ] WordPress successfully fetches and caches data from the Next.js API
- [ ] Confirmed transient cache expires and refreshes as expected
- [ ] Simulated API failure correctly falls back to cached/last-known data instead of breaking the page
- [ ] Outbound request confirmed working on production WordPress host, not just local
- [ ] API key not present anywhere in the WordPress database or repo

---

## Phase 3 — Page Structure & Templates

### `/programs` (catalog page — confirm final path)

- Grid/list layout, one card per programme
- Card shows: title, **next session's** dates, price (with early-bird treatment), seats or "Full — join waitlist", short description
- Because a programme can have several cohorts, decide the card behaviour: show only `nextSession`, or list all sessions. **Recommendation: card shows the next session; the detail page lists them all.**
- "Register" button → the `registerUrl` from the API verbatim
- Nav label must distinguish this from the existing LearnPress "All Courses" — e.g. "Live Trainings," "Cohort Programs"

### `/programs/{courseCode}` (detail page — optional for v1)

- Full description, **all** upcoming sessions with per-session register buttons, price, seats
- Pulls from `GET /api/public/catalog/{courseCode}`

### Design notes

- Match knowsia.com's existing theme
- Add a nav/footer entry so the catalog is discoverable
- **Apply the canonical decision from Finding 1** — this is the phase where duplicate content becomes real

### Acceptance Criteria — Phase 3

- [ ] `/programs` renders all live programmes correctly within the existing theme
- [ ] All "Register" buttons use the API's `registerUrl` and land on the correct pre-selected cohort
- [ ] Tested with 0, 1, and many programmes (empty/edge states handled)
- [ ] Tested with a **full** batch, an **uncapped** batch, a **free** batch, and one with a **live early-bird**
- [ ] A programme with multiple cohorts displays correctly
- [ ] No URL collision with LearnPress `/courses/` or `/course-category/`
- [ ] Canonical tags in place per the Finding 1 decision

---

## Phase 4 — Fallbacks & Monitoring

1. If the API fails and no cached data exists, show "Course info temporarily unavailable — please check back shortly"
2. Add uptime monitoring on the API endpoint. **Note:** the portal already has `/api/health` returning `{"status":"ok"}` and an Uptime Robot task outstanding in `PLAN.md` — fold this in rather than standing up something separate.
3. Log API errors (timestamp, endpoint, error)

### Acceptance Criteria — Phase 4

- [ ] Simulated total API outage shows the fallback message, not a broken page
- [ ] Monitoring alert fires (or log entry created) when the API is unreachable

---

## Phase 5 — SEO

1. `<title>` and meta description on `/programs` and each `/programs/{courseCode}`
   *(Revision 1 said `/courses` here, contradicting its own `/programs` placeholder — corrected.)*
2. `Schema.org` `Course` + `CourseInstance` structured data, pulling live `price` and `availability`
   - `CourseInstance` per session is the correct shape for multi-cohort programmes; a bare
     `Course` cannot express per-cohort dates and pricing
3. Submit to Google Search Console after launch
4. Ensure pages are crawlable and server-rendered
5. **Resolve canonicalisation against reg.knowsia.com/programmes** (Finding 1) — otherwise the two
   properties compete for the same queries and this phase can make rankings worse, not better

### Acceptance Criteria — Phase 5

- [ ] Schema validates in Google's Rich Results Test
- [ ] Meta titles/descriptions present and unique per programme
- [ ] Pages indexable (no accidental noindex/robots block)
- [ ] Exactly one canonical URL per programme across both domains

---

## Decisions Needed Before Starting

**Settled by reading the codebase (Revision 2):** database/ORM, slugs, API key approach, and
whether seats/status are computed — see Finding 5.

**Still needed from the stakeholder:**

1. **Canonical/duplicate content** — reg.knowsia.com/programmes already exists and ranks. Which
   property is canonical? *(New in Revision 2, and the most consequential question here.)*
2. Final public path and nav label on WordPress (`/programs` is a placeholder).
3. Are detail pages (`/programs/{courseCode}`) in scope for v1, or is the grid enough?
4. What WordPress hosting environment is knowsia.com on (outbound HTTP allowed)?
5. Should the new catalog cross-link with the existing LearnPress courses, or stay fully separate?
6. Card behaviour for multi-cohort programmes: next session only, or all sessions?

---

## Suggested Build Order

1. **Phase 1** — public catalog API (thin layer over the existing read model) — test via curl/Postman
2. **Phase 2** — WordPress fetch/cache layer
3. **Phase 3** — catalog + detail templates
4. **Phase 4** — fallbacks + monitoring
5. **Phase 5** — SEO + canonicalisation + Search Console

**Revised estimate: ~2–3 weeks**, down from 3–4. Phase 1 shrinks from roughly a week to 1–2 days
because the read model, the seat maths, the pricing logic, and its tests already exist. The
saving is entirely on the Next.js side; the WordPress phases are unchanged and remain the bulk
of the work.

**Prerequisite before Phase 3:** get an answer on the canonicalisation question. It is cheap to
decide now and expensive to retrofit after both properties are indexed.

---

## Cutover sequence (2026-08-05) — order matters

The canonicalisation question is now answered: **knowsia.com is canonical, and the portal's
`/programmes` pages are retired.** That makes the ordering below load-bearing rather than
advisory — steps 4 and 5 are the irreversible ones.

1. **Set `CATALOG_API_KEY`** in Vercel (a long random value) and redeploy. Until it is set the
   API fails closed and returns 401 to everyone, which is the intended safe default.
2. **Install the plugin** on knowsia.com per `wordpress/README.md`: copy the folder, define
   `KNOWSIA_CATALOG_API_KEY` in `wp-config.php` with the *same* value, activate, create the
   `/programmes` page containing `[knowsia_programmes]`, flush permalinks.
3. **Verify knowsia.com/programmes renders** — and specifically check a programme with several
   cohorts, a free one (ESG2 today), and an uncapped one. If the host blocks outbound HTTP the
   page will be empty; that is the single most common failure and it must be fixed here, not
   after step 4.
4. **Only then set `RETIRE_PROGRAMMES_REDIRECT=true`** in Vercel and redeploy. From this point
   `reg.knowsia.com/programmes` and `/programmes/{code}` 301 to knowsia.com.
5. **Submit the new URLs to Google Search Console** and, if convenient, request removal or
   re-crawl of the old portal URLs so the redirect is picked up quickly.

**Rollback:** unset `RETIRE_PROGRAMMES_REDIRECT` and redeploy — the portal's `/programmes` pages
are still present in the codebase and start serving again immediately. Browsers that already
cached the 301 will keep following it for a while, which is the one part that cannot be undone
instantly. That is the reason for step 3.

**Also update after cutover:** the published marketing briefs in `Coding Docs/*.md` link
directly to `reg.knowsia.com/programmes/{CODE}`. The per-code redirect keeps those working, but
they should be rewritten to point at knowsia.com when convenient.
