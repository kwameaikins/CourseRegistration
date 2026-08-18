# Cron worker

Fires the one `*/15` cron route that Vercel cannot host, so the 2-hour class
reminder actually goes out.

| | |
| --- | --- |
| Schedule | `*/15 * * * *` |
| Calls | `GET {APP_BASE_URL}/api/cron/class-reminders-frequent` |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| Deployed | `knowsia-cron` (Cloudflare Workers) |
| Cost | £0 — cron triggers are on the free plan; ~2,880 requests/month against a 100k/day allowance |

Unaffected: `/api/cron/reminders` (07:00) and `/api/cron/attendance` (21:00)
stay on Vercel Cron via `vercel.json`.

## Why this exists

Vercel Hobby allows two cron jobs and fires them once a day. Both slots are
already used, and a daily job cannot hit a "2 hours before class" window.

This previously ran as `.github/workflows/class-reminders-frequent.yml`, which
**failed on all 414 runs between 2026-08-02 and 2026-08-18**. The repository
secret `CRON_SECRET` was never added (it was still an unchecked item in
PLAN.md), so `curl` sent `Authorization: Bearer ` with an empty value, every
request 401'd, and `curl --fail` exited non-zero. Nobody noticed, because a red
X on the Actions tab is not somewhere anyone looks. **The `class_reminder_2h`
message had therefore never been sent once.** Deploying this worker is what
repairs that.

The 24h reminder was never affected: `/api/cron/reminders` calls the same
`runClassReminderDispatch()` daily, and 24h is date-level.

Cloudflare was chosen over a third-party cron service because R2 is already in
use there, so `CRON_SECRET` stays in infrastructure the business controls.

## Setup

`CRON_SECRET` must match the value the app checks. The Vercel variable is marked
**Sensitive**, so it cannot be read back — not from the dashboard, and
`vercel env pull` returns an 11-character placeholder. The local `.env` copy is
stale and does not match production (verified: it returns 401). In practice that
means **rotating** it rather than recovering it, which costs nothing here because
no caller currently authenticates successfully anyway.

```bash
cd scripts/cron-worker
npx wrangler login                      # once
npx wrangler secret put CRON_SECRET     # paste the NEW value
npx wrangler deploy
```

Set the same new value in Vercel (Settings → Environment Variables →
`CRON_SECRET`, Production) and **redeploy** — a Vercel env change does not reach
a running deployment until you do.

## Verifying

```bash
npx wrangler tail                # live logs; expect "run complete — 1/1 ok"
npx wrangler secret list         # [] means no secret is set
npx wrangler deployments list
```

A `200` only proves the route was called. Confirm the app agrees by checking for
a new row in the reminder log.

Cloudflare dashboard → Workers → `knowsia-cron` → Logs also has a **Trigger
Cron** button for a manual run.

## Notes

- **No HTTP surface.** The worker answers 404 to every request and acts only on
  its cron trigger. An open endpoint would let anyone who found the
  `workers.dev` hostname trigger reminder dispatches at will.
- **A missing `CRON_SECRET` logs and skips** rather than firing requests that
  every route answers 401 — which is precisely the failure that went unseen for
  sixteen days.
- `Promise.allSettled`, not `all`, so adding a second route later cannot let one
  failure cancel another.
- **Do not add `/api/cron/news-pipeline-advance` back.** Knowsia Insights was
  decommissioned on 2026-08-18; that route is now a 410.
- `APP_BASE_URL` lives in `wrangler.toml`; change it there if the domain moves.

## Rollback

`npx wrangler delete` removes the worker. The GitHub workflow it replaced is not
worth restoring — it never worked.
