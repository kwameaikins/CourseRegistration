// Scheduled pinger for the two cron routes that Vercel cannot host.
//
// Vercel Hobby caps cron jobs at 2 and fires them once a day; both slots are
// already spent on /api/cron/reminders (07:00) and /api/cron/attendance
// (21:00), and neither can hit a "2 hours before class" window. That gap used
// to be filled by two GitHub Actions workflows on a */15 schedule.
//
// Those workflows only stay free while the repository is PUBLIC. Going private
// puts them on the Free plan's 2,000 Actions-minutes/month allowance, and
// because GitHub rounds every job up to a full minute, 2 workflows x 96 runs a
// day is ~5,760 minutes — the quota would run out around day ten and both
// crons would stop silently. This worker moves that scheduling onto Cloudflare
// (already in use for R2), where it stays genuinely free and the secret stays
// in infrastructure we control rather than a third-party cron service.
//
// Both routes are safe to call more often than needed and safe to overlap:
// every send is deduped by its own log-table unique constraint, and
// pipeline_jobs.stage only ever moves forward. That is what makes it safe to
// run this worker and the GitHub workflows side by side during cutover.

const ROUTES = [
  '/api/cron/class-reminders-frequent',
  '/api/cron/news-pipeline-advance',
];

async function ping(baseUrl, path, secret) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
    });
    // The body is read so the response is drained, and because these routes
    // report per-run counts that are worth having in `wrangler tail` when
    // something looks wrong.
    const body = await response.text().catch(() => '');
    if (!response.ok) {
      console.error(`[cron] ${path} -> ${response.status} ${body.slice(0, 300)}`);
      return { path, ok: false, status: response.status };
    }
    console.log(`[cron] ${path} -> ${response.status} ${body.slice(0, 200)}`);
    return { path, ok: true, status: response.status };
  } catch (err) {
    // A network failure must not prevent the other route from being called.
    console.error(`[cron] ${path} -> threw: ${err}`);
    return { path, ok: false, status: 0 };
  }
}

const worker = {
  async scheduled(event, env) {
    if (!env.CRON_SECRET) {
      // Loud rather than silent: a missing secret would otherwise look like a
      // working schedule that every route rejects with 401.
      console.error('[cron] CRON_SECRET is not set — skipping run');
      return;
    }
    const baseUrl = (env.APP_BASE_URL || 'https://reg.knowsia.com').replace(/\/$/, '');

    // allSettled, not all: one failing route must never cancel the other.
    const results = await Promise.allSettled(
      ROUTES.map((path) => ping(baseUrl, path, env.CRON_SECRET)),
    );
    const failed = results.filter(
      (r) => r.status === 'rejected' || (r.value && !r.value.ok),
    ).length;
    console.log(`[cron] run complete — ${ROUTES.length - failed}/${ROUTES.length} ok`);
  },

  // Deliberately no HTTP surface. Answering GETs would create an
  // unauthenticated way for anyone who learns the workers.dev hostname to
  // advance the news pipeline, which costs real Anthropic spend per run.
  // Use the dashboard's "Trigger Cron" button or `wrangler dev --test-scheduled`
  // to fire a run by hand.
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};

export default worker;
