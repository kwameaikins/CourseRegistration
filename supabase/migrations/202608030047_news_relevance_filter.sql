-- Knowsia Insights relevance gate (founder-approved 2026-08-03).
--
-- Measured on the first real pipeline run: every triaged story went on to
-- drafting + verification at ~$0.045 each, and the three that auto-published
-- were IFAC think-pieces about Romania's audit chamber and China's
-- accounting profession — correct and well-grounded, but not content for an
-- ICAG/ACCA audience in Ghana. Those two mid-tier agents were 81% of total
-- spend, so paying full price to draft off-audience stories was both the
-- largest cost and a content-quality problem.
--
-- The Triage Agent already reads every item for ~$0.002. It now also scores
-- audience relevance, and items below the threshold stop here instead of
-- reaching the expensive stages. This adds the terminal stage that records
-- that outcome, kept distinct from:
--   'monitoring' — duplicates absorbed into an existing story
--   'blocked'    — Level 3 editorial risk (doc Section 5)
-- so the Pipeline tab shows plainly how much is being filtered and the
-- threshold can be tuned against real numbers rather than guessed.
begin;

alter table public.pipeline_jobs drop constraint if exists pipeline_jobs_stage_check;

alter table public.pipeline_jobs
    add constraint pipeline_jobs_stage_check check (stage in (
        'collected', 'triaged', 'researched', 'verified', 'routed',
        'published', 'monitoring', 'review', 'blocked', 'error', 'filtered'
    ));

comment on column public.pipeline_jobs.stage is
    'Pipeline position. Terminal states: published/monitoring (success), review (awaiting Level 2), blocked (Level 3 risk), filtered (below the audience-relevance threshold), error (retries exhausted).';

commit;
