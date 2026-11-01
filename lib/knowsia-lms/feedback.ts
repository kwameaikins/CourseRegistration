// Knowsia LMS: course feedback and certificate eligibility (lms 029, 2026-10-31).
//
// With CERTIFICATE_ELIGIBILITY=lms this app stops storing feedback and deciding
// who is owed a certificate; the LMS does both. Like certificates.ts these calls
// THROW when the LMS cannot be reached (an AppError 503): a feedback form that
// silently dropped an answer would be worse than one that says "try again".
import { AppError } from '@/lib/errors';
import type { FeedbackSubmissionInput, BatchFeedbackSummary, PublicFeedbackContext } from '@/modules/feedback/types';

export function certificateEligibility(): 'local' | 'lms' {
  return (process.env.CERTIFICATE_ELIGIBILITY ?? '').trim().toLowerCase() === 'lms' ? 'lms' : 'local';
}

const PREFIX = '/api/v1/service/lms';

function unavailable(): AppError {
  return new AppError('LMS_UNAVAILABLE', 'Feedback is unavailable right now — try again shortly.', 503);
}

function base(): string {
  // trim(): a stray CR from a piped env var 500'd every proxied call once (2026-08-23).
  return (process.env.KNOWSIA_LMS_API_URL || process.env.KNOWSIA_APP_API_URL || '').trim().replace(/\/+$/, '');
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  if (!base() || !process.env.KNOWSIA_APP_SERVICE_KEY) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY.trim() },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error('[lms feedback]', err);
    throw unavailable();
  }
  if (response.status >= 500 || response.status === 401 || response.status === 403) {
    console.error('[lms feedback]', response.status);
    throw unavailable();
  }
  return response;
}

const NOT_VALID = () => new AppError('NOT_FOUND', 'This feedback link is not valid.', 404);

async function body<T>(response: Response): Promise<T> {
  if (response.status >= 400) throw new AppError('LMS_ERROR', `The LMS answered ${response.status}.`, 502);
  return (await response.json()) as T;
}

/** The public form's context. 404 (an unknown or erased registration) is the page's "not valid" state. */
export async function feedbackContextOnLms(registrationId: string): Promise<PublicFeedbackContext> {
  const response = await request(`${PREFIX}/feedback/${encodeURIComponent(registrationId)}`);
  if (response.status === 404) throw NOT_VALID();
  const data = await body<{ courseTitle: string; participantName: string | null; submitted: boolean }>(response);
  return {
    courseName: data.courseTitle,
    cohortLabel: '',
    participantFirstName: (data.participantName ?? '').trim().split(/\s+/)[0] ?? '',
    alreadySubmitted: Boolean(data.submitted),
  };
}

/** 404 → not valid; 409 (feedback_exists, or not yet open) → ALREADY_SUBMITTED for feedback_exists. */
export async function submitFeedbackOnLms(registrationId: string, input: FeedbackSubmissionInput): Promise<void> {
  const response = await request(`${PREFIX}/feedback/${encodeURIComponent(registrationId)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (response.status === 404) throw NOT_VALID();
  if (response.status === 409) {
    let detail = '';
    try {
      detail = String(((await response.json()) as { detail?: unknown }).detail ?? '');
    } catch {
      /* no body */
    }
    if (detail && detail !== 'feedback_exists') {
      throw new AppError('FEEDBACK_NOT_OPEN', 'Feedback for this course is not open yet.', 409);
    }
    throw new AppError('ALREADY_SUBMITTED', 'Feedback for this registration has already been submitted — thank you!', 409);
  }
  await body(response);
}

/** The batch is the LMS cohort's external_ref. */
export async function feedbackSummaryOnLms(batchId: string): Promise<BatchFeedbackSummary> {
  const response = await request(`${PREFIX}/cohorts/${encodeURIComponent(batchId)}/feedback/summary`);
  // A batch the LMS has not mirrored has no feedback yet: an empty summary, not an error.
  if (response.status === 404) {
    return {
      responses: 0, paidRegistrations: 0, averageOverall: null, averageRelevance: null, averageFacilitator: null,
      averageConfidence: null, recommendationBreakdown: { yes: 0, maybe: 0, no: 0 }, nps: null, npsResponses: 0, rows: [],
    };
  }
  return body<BatchFeedbackSummary>(response);
}

export interface LmsTestimonial {
  quote: string;
  attributedName: string | null;
  courseName: string;
  overallRating: number;
}

export async function testimonialsOnLms(limit: number): Promise<LmsTestimonial[]> {
  const qs = new URLSearchParams({ limit: String(Math.max(1, Math.min(limit, 50))) });
  return body<LmsTestimonial[]>(await request(`${PREFIX}/testimonials?${qs}`));
}