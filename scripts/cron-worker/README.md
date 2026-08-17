# Cron worker

Fires the two `*/15` cron routes that Vercel cannot host, so that
`.github/workflows/class-reminders-frequent.yml` and
`.github/workflows/news-pipeline-advance.yml` can be retired and the repository
can be made private.

| | |
| --- | --- |
| Schedule | `*/15 * * * *` (unchanged from the workflows it replaces) |
| Calls | `GET {APP_BASE_URL}/api/cron/class-reminders-frequent` |
| | `GET {APP_BASE_URL}/api/cron/news-pipeline-advance` |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| Cost | £0 — Cloudflare's free plan includes cron triggers and 100k requests/day; this uses ~2,880/month |

Unaffected: `/api/cron/reminders` (07:00) and `/api/cron/attendance` (21:00)
stay on Vercel Cron via `vercel.json`. This worker does not touch them.

## Why this exists

GitHub Actions is unlimited on **public** repositories and capped at 2,000
minutes/month on the Free plan for **private** ones. Every Actions job is billed
rounded up to a full minute, so two workflows firing 96 times a day is roughly
**5,760 minutes/month** — the allowance would be gone in about ten days and both
crons would stop with no failure anyone would notice. Making the repository
private without moving these first would take down class reminders and the
Knowsia Insights pipeline.

## One-time setup

`CRON_SECRET` must be the *same value* the app checks — the existing Vercel
environment variable. Copy it from Vercel (Settings → Environment Variables),
or from the GitHub repository secret of the same name. Do not invent a new one,
or every request will 401.

```bash
cd scripts/cron-worker
npx wrangler login              # opens a browser once
npx wrangler secret put CRON_SECRET   # paste the value when prompted
npx wrangler deploy
```

The secret is stored encrypted by Cloudflare and is never written to this repo.

## Cutover order — do not reverse

The two schedulers are safe to run at the same time: every send is deduped by
its log-table unique constraint and `pipeline_jobs.stage` only moves forward. So
overlap, rather than a hard switch, is the safe path.

1. Deploy the worker (above) while the GitHub workflows are **still running**.
2. Watch one 15-minute cycle: `npx wrangler tail` should show
   `run complete — 2/2 ok`.
3. Confirm the app agrees — a fresh row in the reminder log / a pipeline job
   advancing a stage. Cloudflare reporting 200 only proves it called the route.
4. Only then remove the `schedule:` trigger from both workflow files, keeping
   `workflow_dispatch` so each can still be fired by hand from the Actions tab.
5. Only then flip the repository to Private.

Removing the schedules before step 3 leaves a window with no scheduler at all.

## Verifying it is alive later

```bash
npx wrangler tail               # live logs
npx wrangler deployments list   # what is deployed
```

Cloudflare dashboard → Workers → `knowsia-cron` → Logs also shows past runs and
has a **Trigger Cron** button for a manual run.

## Rollback

Restore the `schedule:` block in the two workflow files and push. If the repo is
already private, either make it public again or accept the Actions quota until
the worker is fixed. To stop the worker: `npx wrangler delete`.

## Notes

- The worker exposes **no HTTP endpoint** — it answers 404. An open URL would
  let anyone who learned the `workers.dev` hostname advance the news pipeline,
  which spends real Anthropic credit per run.
- `APP_BASE_URL` lives in `wrangler.toml`. Change it there if the deployed
  domain ever stops being `reg.knowsia.com`.
- One route failing never prevents the other from being called.
