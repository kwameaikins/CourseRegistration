# WordPress deliverables (knowsia.com)

Code in this folder runs on **knowsia.com** (WordPress), not on this Next.js app. It lives in
this repository only because there is no other version-controlled home for it — nothing here is
built, tested, deployed, or imported by the Next.js build.

## knowsia-programmes

A small plugin that renders the live programme catalogue on knowsia.com by pulling from this
app's `/api/public/catalog` endpoints. Read-only: registration still happens on
reg.knowsia.com.

### Install

1. Copy the `knowsia-programmes/` folder to `wp-content/plugins/` on knowsia.com.
2. Add to `wp-config.php` (above the "That's all, stop editing" line):

   ```php
   define( 'KNOWSIA_CATALOG_API_KEY', 'the-value-of-CATALOG_API_KEY-from-vercel' );
   ```

   Use the same value set as `CATALOG_API_KEY` in the Vercel project. **Never** commit it or
   store it in the WordPress database.

3. Activate **Knowsia Live Programmes** in Plugins.
4. Create a Page titled *Programmes* with the slug exactly **`programmes`**, and put this in the
   content: `[knowsia_programmes]`
5. Visit **Settings → Permalinks** and click Save once, to flush rewrite rules. Without this,
   `/programmes/AI05` will 404.
6. Add *Programmes* to the main navigation menu.

### What you get

| URL | Renders |
|---|---|
| `knowsia.com/programmes` | Card grid, one per programme, showing the next cohort's dates, price, and seats |
| `knowsia.com/programmes/AI05` | Full detail: overview, outcomes, **every** upcoming cohort with its own price and register button, FAQ, and `Course` + `CourseInstance` JSON-LD |

Register buttons link to `reg.knowsia.com/register?batchId=…`, which pre-selects that exact
cohort. The plugin uses the `registerUrl` the API returns rather than building URLs itself.

### Before go-live — check these

- [ ] The host allows **outbound HTTP** to reg.knowsia.com. Some managed WordPress hosts block
      it by default, and it is the most common cause of a blank catalogue. Test on production,
      not just locally.
- [ ] The slug is `/programmes/` and **not** `/courses/`. `/courses/` is already LearnPress's
      archive on this site; pointing this plugin there will collide with it.
- [ ] `KNOWSIA_CATALOG_API_KEY` matches Vercel's `CATALOG_API_KEY` exactly.
- [ ] Permalinks flushed (step 5).
- [ ] Check a programme with several cohorts, a fully-booked one, a free one, and one with a
      live early-bird price — those are the four cases the templates branch on.

### Behaviour worth knowing

**Caching.** Responses are cached in a WordPress transient for 60 seconds. The API also sets
`s-maxage=30`, so a seat count on knowsia.com can lag reality by up to ~90 seconds. That is
acceptable because the portal re-checks availability at registration time and routes a full
cohort to the waitlist — but do not write marketing copy promising real-time seat counts.

**Failure handling.** Every successful response is also stored in a long-lived fallback
transient. If the API becomes unreachable, the page keeps rendering the last known good data
rather than breaking. Only when there has never been a successful response does it show
"temporarily unavailable". A `404` is treated as a real answer, not an outage, so a retired
programme disappears instead of lingering from the fallback cache.

**Uncapped cohorts.** `seatsRemaining: null` means no capacity limit — the templates render
nothing rather than "0 seats left". If you edit the templates, preserve that distinction; it is
the easiest field here to get wrong.

**Styling.** The plugin ships minimal CSS and inherits the theme's fonts and colours. The one
hardcoded value is the primary button colour (`#0f5132`) — change it in the `wp_add_inline_style`
block near the bottom of the plugin to match the brand.

### Canonicalisation

Decision of 2026-08-05: **knowsia.com is canonical** for programme content. The plugin emits
`<link rel="canonical">` pointing at itself, and `reg.knowsia.com/programmes` 301-redirects
here.

That redirect is **not yet enabled** — see `next.config.ts` in the repository root. Turn it on
only once these pages are live and verified, or real visitors will be redirected into a 404.
