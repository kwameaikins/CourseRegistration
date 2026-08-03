import * as newsRepository from '@/modules/news-insights/repository';
import type { Database } from '@/lib/supabase/database.types';

type PipelineJobRow = Database['public']['Tables']['pipeline_jobs']['Row'];

// A job is retried a couple of times before being parked. Transient causes
// (an API blip, a rate limit) clear on the next 15-minute tick; a genuinely
// malformed item would otherwise be retried forever, paying for a model
// call each time.
const MAX_ATTEMPTS = 3;

export function describePipelineError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const candidate = err as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.code].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length > 0) return parts.join(' | ');
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

// Runs one job's work with its failure contained to that job.
//
// Without this every stage propagated the first exception all the way out
// of runPipelineAdvance, so one malformed item aborted the entire tick —
// including stages that had already succeeded for unrelated items. That is
// exactly what happened on the first real run: a single unexpected audience
// tag from the triage model 500'd the whole cron route.
//
// Failures land on the job itself (`error_message`, `attempts`, and the
// `error` stage once exhausted), which is what the Editorial Dashboard's
// Pipeline tab already reads — the columns existed for this from the start.
export async function runJobSafely(
  job: PipelineJobRow,
  work: () => Promise<void>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await work();
    return { ok: true };
  } catch (err) {
    const message = describePipelineError(err);
    const attempts = job.attempts + 1;
    // Below the cap the stage is left untouched so the next tick retries;
    // at the cap the job is parked in `error` for a human to look at.
    await newsRepository
      .updatePipelineJob(job.id, {
        attempts,
        error_message: message,
        ...(attempts >= MAX_ATTEMPTS ? { stage: 'error' } : {}),
      })
      .catch(() => undefined);
    console.error(`[news pipeline] job ${job.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}):`, message);
    return { ok: false, message };
  }
}
