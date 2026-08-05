# WordPress deliverables (knowsia.com)

Code in this folder runs on **knowsia.com** (WordPress), not on this Next.js app. It lives in
this repository only because there is no other version-controlled home for it — nothing here is
built, tested, deployed, or imported by the Next.js build.

## knowsia-programmes

A small plugin that renders the live programme catalogue on knowsia.com by pulling from this
app's `/api/public/catalog` endpoints. Read-only: registration still happens on
reg.knowsia.com.

### Install

The ready-to-upload file is **`knowsia-programmes.zip`** in this folder. No SSH or FTP needed.

1. **Set the key in Vercel first.** In the reg.knowsia.com project → Settings → Environment
   Variables, add `CATALOG_API_KEY` with a long random value, then redeploy. Until this is set
   the API returns 401 to everyone (it fails closed by design).
2. **Upload the plugin.** In WordPress admin: **Plugins → Add New → Upload Plugin**, choose
   `knowsia-programmes.zip`, then **Install Now** → **Activate**.
3. **Paste the key.** Go to **Settings → Knowsia Programmes** and enter the same value you set
   as `CATALOG_API_KEY` in step 1. Save.
4. **Click "Test connection"** on that same screen. It calls the live API and tells you exactly
   what came back — "Connected. 4 programmes returned." means everything works. Fix any error
   here before going further; a failure at this step is why the page would otherwise render blank.
5. **Create the page.** Pages → Add New, title **Live Programmes**, slug exactly
   **`programmes`**, content: `[knowsia_programmes]`. Publish.

   The title and the slug deliberately differ. "Live Programmes" tells visitors these are
   cohort-based, date-bound trainings, distinct from the self-paced LearnPress courses at
   `/courses/` — that is the whole reason this catalogue needed its own home. The slug stays
   short, and matches the path already indexed on reg.knowsia.com so the redirect maps 1:1.
   Set the slug by hand in the page editor; WordPress will otherwise derive `live-programmes`
   from the title.

6. **Flush permalinks.** Settings → Permalinks → Save (no changes needed). Without this,
   `/programmes/AI02` will 404 even though `/programmes` works.
7. **Add it to the menu.** Appearance → Menus. Label it **Live Programmes**, and make sure it
   reads clearly next to the existing "All Courses" LearnPress entry.

#### If you want the URL to be `/live-programmes` too

Free to do right now — nothing is published or indexed yet. Two settings must change together:

1. In `wp-config.php`: `define( 'KNOWSIA_PROGRAMMES_SLUG', 'live-programmes' );`
   (and set the WordPress page's slug to match), then re-save permalinks.
2. In Vercel on the reg.knowsia.com project: `MARKETING_PROGRAMMES_PATH=/live-programmes`.

If only one of the two changes, every visitor following the retirement redirect from
reg.knowsia.com lands on a 404. After the page is published and indexed, changing the slug also
means orphaning any links already shared, so decide before step 5.

#### Optional: keep the key out of the database

Step 3 stores the key in `wp_options`, which is convenient but means it appears in database
backups. If you can edit `wp-config.php`, this is tidier — add it above the "That's all, stop
editing" line:

```php
define( 'KNOWSIA_CATALOG_API_KEY', 'the-value-of-CATALOG_API_KEY-from-vercel' );
```

The constant always wins over the settings field, and the settings screen will show the field as
read-only so nobody wonders why editing it does nothing.

Either way the key guards data that is already public — it exists to stop the endpoint being
scraped, not to protect secrets — so the settings-page route is a reasonable trade.

#### Updating the plugin later

Re-zip the folder and upload again via **Plugins → Add New → Upload Plugin**; WordPress will
offer to replace the existing copy. Your saved settings survive the update.

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
