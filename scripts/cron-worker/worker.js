// Scheduled pinger for the cron route Vercel cannot host.
//
// Vercel Hobby caps cron jobs at 2 and fires them once a day. Both slots are
// already spent on /api/cron/reminders (07:00) and /api/cron/attendance
// (21:00), and a once-a-day job cannot hit a "2 hours before class" window.
// That is the entire reason this worker exists.
//
// HISTORY, because it explains why this is not simply a nice-to-have:
// the same job previously ran as .github/workflows/class-reminders-frequent.yml
// and FAILED ON ALL 414 RUNS from 2026-08-02 to 2026-08-18 — the repository
// secret CRON_SECRET was never added, so curl sent `Authorization: Bearer `
// with an empty value, every request 401'd, and `curl --fail` exited non-zero.
// Nobody saw it, because a red X on the Actions tab is not a place anyone
// looks. So the class_reminder_2h message had never once been sent. Deploying
// this worker is what actually repairs that.
//
// The 24h reminder is unaffected and always worked: /api/cron/reminders calls
// the same runClassReminderDispatch() daily, and 24h is date-level.
//
// The route is safe to call more often than needed and safe to overlap: every
// send is deduped by its own log-table unique constraint.

const ROUTES = [
  '/api/cron/class-reminders-frequent',
  // /api/cron/news-pipeline-advance was here. Knowsia Insights was
  // decommissioned on 2026-08-18 (founder decision) and must NOT be revived by
  // adding it back — advancing that pipeline spends Anthropic credit per run.
];

async function ping(baseUrl, path, secret) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
    });
    // The body is read so the response is drained, and because the route
    // reports per-run counts worth having in `wrangler tail` when something
    // looks wrong.
    const body = await response.text().catch(() => '');
    if (!response.ok) {
      console.error(`[cron] ${path} -> ${response.status} ${body.slice(0, 300)}`);
      return { path, ok: false, status: response.status };
    }
    console.log(`[cron] ${path} -> ${response.status} ${body.slice(0, 200)}`);
    return { path, ok: true, status: response.status };
  } catch (err) {
    // A network failure on one route must not prevent any other being called.
    console.error(`[cron] ${path} -> threw: ${err}`);
    return { path, ok: false, status: 0 };
  }
}

const worker = {
  async scheduled(event, env) {
    if (!env.CRON_SECRET) {
      // Loud rather than silent. An absent secret is exactly what broke the
      // GitHub workflow for sixteen days, and it presented as a schedule that
      // looked alive while every request was rejected.
      console.error('[cron] CRON_SECRET is not set — skipping run');
      return;
    }
    const baseUrl = (env.APP_BASE_URL || 'https://reg.knowsia.com').replace(/\/$/, '');

    // allSettled, not all: one failing route must never cancel another. Kept
    // despite there being a single route today, so adding one later is safe.
    const results = await Promise.allSettled(
      ROUTES.map((path) => ping(baseUrl, path, env.CRON_SECRET)),
    );
    const failed = results.filter(
      (r) => r.status === 'rejected' || (r.value && !r.value.ok),
    ).length;
    console.log(`[cron] run complete — ${ROUTES.length - failed}/${ROUTES.length} ok`);
  },

  // Deliberately no HTTP surface. Answering GETs would let anyone who learned
  // the workers.dev hostname trigger reminder dispatches at will. Use the
  // dashboard's "Trigger Cron" button or `wrangler dev --test-scheduled` to
  // fire a run by hand.
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};

export default worker;
