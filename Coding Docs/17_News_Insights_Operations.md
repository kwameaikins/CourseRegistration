# Knowsia Insights — Operations (Companion to Document 3)

| Field | Value |
|---|---|
| **Document** | Knowsia Insights Operations |
| **Module** | `modules/news-insights`, `m11-news-insights` |
| **Status** | Phase 1 shipped 2026-08-02 |
| **Source spec** | `Coding Docs/Knowsia_Insights_Agentic_News_Refined.md` |

---

## 1. What this is

An 8-agent-minus-1 pipeline (Personalisation deferred to Phase 2) that collects, drafts,
independently verifies, risk-routes, and publishes news/analysis for Knowsia's
accounting/finance audience, plus the staff Editorial Dashboard (`/editorial`) and the
public site (`/news`). Built per the founder-approved plan on 2026-08-02, matching the
source doc's Phase 1 scope with one change: **all 7 canonical categories ship now**, not
the doc's proposed 3-category beachhead (explicitly founder-confirmed, overriding the doc's
own recommendation).

Still Phase 2 per the doc's own deferral list (not reopened by the category-scope decision
above): personalisation/follow features, Ask Knowsia, the Standards Tracker page as a
dedicated screen, and Start-up Watch.

## 2. Deviations from the source doc — read before assuming the doc is current

1. **No pgvector/embeddings.** Section 8.3 proposed pgvector for semantic dedup. This
   project has no embeddings provider configured (Anthropic doesn't offer one, and adding a
   second vendor is a new paid integration requiring the same sign-off as every other paid
   service in `CLAUDE.md`, not asked for). Dedup uses exact `content_hash` matching (the
   doc's own primary mechanism) plus `pg_trgm` fuzzy title similarity — see
   `fn_news_similar_titles` in the migration. Revisit if/when an embeddings provider is
   approved.
2. **No sources are pre-seeded.** Fabricating real news source URLs isn't something to do
   without verification. `news_sources` ships empty — add real ones (ICAG, ACCA, IFAC, etc.)
   via the Editorial Dashboard's Source registry. The pipeline is naturally dormant until at
   least one active source exists, same posture as WhatsApp/SMS being dormant until
   credentials are set.
3. **Level 3 ("never auto-publish") has no review path yet.** The doc says Level 3
   requires "explicit founder or senior-editor sign-off, logged with rationale" — that
   override UI isn't built. A Level 3 story sits blocked with its `risk_reasons` visible on
   the Pipeline tab; there is currently no way to un-block one except directly in the
   database. Candidate for a later phase.
4. **Monitoring & Update Agent is minimal.** Watching published stories for corrections,
   postponements, or developing-story progress (the doc's description of this agent) isn't
   automated — there's no re-fetch/re-verify loop. `pipeline/monitoring.ts` currently only
   handles the Section 12 item 2 retention purge. Corrections are staff-initiated via the
   `addCorrection` service function (not yet wired to a UI button — call
   `POST /api/published-articles/[id]/corrections` directly, or add a button when needed).
5. **Retention window and Level 2 SLA are placeholders**, exactly as flagged in the source
   doc's Section 12 items 2 and 3 — neither has a founder/legal-confirmed answer yet:
   - `raw_news_items.raw_text` is purged 30 days after collection (see
     `RAW_TEXT_RETENTION_DAYS` in `modules/news-insights/service.ts`).
   - The Section 5 "4 business hours" Level 2 review SLA is documented only — there's no
     staffing number, so nothing enforces or escalates it. The `/editorial` Review Queue tab
     is the only visibility into how large the backlog actually is.

## 3. Architecture

Standard module boundary (`Coding Docs/11_Coding_Standards_and_Conventions.md`):
`modules/news-insights/types.ts` (domain types, zod schemas, the canonical taxonomy as
`const` arrays — single source of truth, matches `NEWS_CATEGORIES` to the migration's CHECK
constraints exactly) / `repository.ts` (Supabase CRUD, service-role client) / `service.ts`
(business logic, `requireRole(['admin', 'marketing'])` on every write and staff read).

`modules/news-insights/pipeline/` holds the 7 active agents as plain functions, not
Admin-Assistant tools:

| File | Agent | Model tier |
|---|---|---|
| `source-collection.ts` | Source & Collection | Cheap (`claude-haiku-4-5-20251001`) |
| `triage.ts` | Triage (dedup + classify) | Cheap |
| `research-drafting.ts` | Research & Drafting | Mid (`claude-sonnet-5`) |
| `verification.ts` | Verification — independent pass | Mid |
| `editorial-risk.ts` | Editorial Risk & Routing | Cheap |
| `publishing.ts` | Publishing | No LLM call — deterministic slug/labels/write |
| `monitoring.ts` | Monitoring & Update | No LLM call — retention purge only (see §2.4) |

`model-client.ts` is the one shared caller: every agent call is a **forced single tool
call** (never open-ended generation) built from a zod schema via `z.toJSONSchema()`, and
every call — success or failure — logs to `agent_run_log`. This is the doc Section 4.1
prompt-injection mitigation in one place: ingested content is always framed as data in the
system prompt, and the model can only ever populate the typed fields asked for.

`orchestrator.ts`'s `runPipelineAdvance()` runs one bounded batch (8 items) per stage per
call, advancing `pipeline_jobs.stage` — this is the doc's own Section 8.2 recommendation
(a status column instead of a message queue), already this codebase's established pattern
(`campaigns.status`, `payment_submissions.status`). Called by
`GET /api/cron/news-pipeline-advance`, polled every 15 minutes by
`.github/workflows/news-pipeline-advance.yml` (Vercel Hobby's 2 cron slots are both already
used — same external-scheduler workaround as `class-reminders-frequent`).

## 4. Verification independence (do not weaken this)

`verification.ts` never receives `article_drafts.research_note` (the drafting agent's own
reasoning) — only the draft's *final* headline/summary/sections plus the original source
text, in a fresh model call. This is the one rule in the whole pipeline that must not be
violated: a verification pass sharing context with the draft it's checking is not
independent, the same reason a preparer can't review their own work in audit. If you ever
find yourself passing `research_note` into the verification prompt "to give it more
context," stop — that's the bug this section exists to prevent.

`editorial-risk.ts` hard-codes one more rule in code, not just prompt: if verification did
not pass, the effective risk level is forced to at least 2, regardless of what the model's
own risk read says. Unverified content can never reach Level 1 auto-publish.

## 5. Risk routing (doc Section 5)

| Level | What happens | Where |
|---|---|---|
| 1 | Publishes immediately via `publishing.ts` | `editorial-risk.ts` |
| 2 | `pipeline_jobs.stage = 'review'`, story visible on `/editorial` Review Queue tab | staff calls `POST /api/news-pipeline/reviews/[id]/submit` (approve / edit & approve / reject) |
| 3 | `pipeline_jobs.stage = 'blocked'`, `stories.status = 'blocked'` | no automated or UI path forward yet — §2 item 3 |

Transparency labels (doc Section 7) are computed in `publishing.ts`'s
`buildTransparencyLabels` — `"Multiple sources verified"` is only ever added when
`verificationPassed` is actually `true`. Don't add a way to set transparency labels from
anywhere else without keeping that invariant.

## 6. Data model

See `Coding Docs/03_Data_Schema_and_ERD.md` Section 14 for the short extension summary.
Full definitions: migration `202608020046_news_insights.sql` — `news_sources`,
`raw_news_items`, `stories`, `story_sources`, `article_drafts`, `editorial_reviews`,
`published_articles`, `deadlines`, `corrections_log`, `pipeline_jobs`, `agent_run_log`.
RLS: admin+marketing manage everything; `published_articles` and `deadlines` also carry a
public-read policy (`anon` + `authenticated`) since that content is legitimately public.

## 7. Cost model (doc Section 10)

`GET /api/news-pipeline/cost-summary` (Editorial Dashboard's Cost tab) aggregates
`agent_run_log` — real token/cost data from day one, not the doc's planning estimate.
`estimateCostUsd` in `pipeline/models.ts` uses rough published per-million-token pricing;
it's a planning figure, not a billing-accurate number — don't wire it into any financial
reporting without re-checking against actual Anthropic invoices first.

## 8. Screens

- **Staff** `/editorial` (`app/(staff)/editorial/page.tsx`, admin+marketing): Review Queue,
  Pipeline (all `pipeline_jobs` with stage badges), Sources (add/enable/disable — the only
  way real sources get in), Cost.
- **Public** `/news`, `/news/[category]`, `/news/article/[slug]`
  (`app/(public)/news/**`) — no shared layout, each page self-includes `KnowsiaHeader`,
  matching `/register` and `/verify`. Category URLs use a slugified form
  (`categoryToSlug`/`slugToCategory` in `types.ts`) since category names contain commas and
  ampersands.

## 9. Operational setup still required before this produces anything

1. Add at least one real, verified news source via `/editorial` → Sources.
2. Add the `CRON_SECRET` repository secret to GitHub Actions if not already present
   (shared with `class-reminders-frequent.yml` — see that workflow's header comment).
3. Confirm `ANTHROPIC_API_KEY` is set in Vercel (already required for the Admin Assistant;
   this reuses the same variable).
4. Apply migration `202608020046_news_insights.sql` to production
   (`npx supabase db push`).
