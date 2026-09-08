// Seam III of platform convergence (Coding Docs/19_Platform_Convergence.md §4):
// granting a participant access to the matching self-paced course on
// KnowsiaApp. NOT automatic (founder rule 2026-08-23, reversing the same-day
// auto-grant wiring): a live-cohort seat and recorded-course access are
// separate commercial decisions, so this fires only when STAFF deliberately
// grant it — normally time-boxed via accessDays. Idempotent over there;
// re-granting restates the access period.
//
// Configuration posture matches Zoom's: both env vars unset → the feature
// simply does not exist yet, and every call is a cheap no-op. That keeps the
// deploy order forgiving — this code can ship before KnowsiaApp is live.
import { AppError, captureToSentry } from '@/lib/errors';
import * as knowsiaAppRepository from '@/modules/knowsia-app/repository';
import * as usersService from '@/modules/users/service';

export function isKnowsiaAppLmsConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

export type LmsGrantOutcome =
  | 'granted'
  | 'skipped_not_configured'
  | 'skipped_gated'
  | 'skipped_no_matching_course'
  | 'failed';

export async function grantLmsAccessSystem(
  registrationId: string,
  // Days of access. Omitted = permanent — reserve that for outright purchases,
  // not courtesy grants to live participants.
  accessDays?: number,
): Promise<LmsGrantOutcome> {
  if (!isKnowsiaAppLmsConfigured()) return 'skipped_not_configured';

  const context = await knowsiaAppRepository.selectLmsGrantContextSystem(registrationId);
  if (!context || context.participantDeleted) return 'skipped_gated';

  const base = process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/service/lms/enrolments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY!,
      },
      body: JSON.stringify({
        email: context.participantEmail,
        name: context.participantFullName,
        phone: context.participantPhone,
        participant_id: context.participantId,
        course_code: context.courseCode,
        access_days: accessDays ?? null,
      }),
    });
  } catch (err) {
    // Same rule the Zoom side effect learned on 2026-08-13: a swallowed error
    // on a path nobody watches is a feature that has silently stopped
    // existing. Sentry, then report failure to the (non-throwing) caller.
    captureToSentry(err, { job: 'knowsia_app_lms_grant', registrationId });
    console.error('[knowsia app lms grant]', err);
    return 'failed';
  }

  if (response.status === 404) {
    // No m2 course carries this course_code as its slug yet — expected until
    // the course's videos have been imported over there. Log-only: this is a
    // content-readiness state, not a fault.
    console.warn(
      `[knowsia app lms grant] no matching course for ${context.courseCode} — ` +
        'import it in KnowsiaApp to enable self-paced access.',
    );
    return 'skipped_no_matching_course';
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    captureToSentry(new Error(`LMS grant failed (${response.status}): ${body.slice(0, 300)}`), {
      job: 'knowsia_app_lms_grant',
      registrationId,
    });
    console.error('[knowsia app lms grant]', response.status, body.slice(0, 300));
    return 'failed';
  }
  return 'granted';
}

// --- Seam III, question-bank half (Coding Docs/19 §4 III) -------------------
//
// KnowsiaApp's half shipped 2026-09-05; this side was never written, and the
// gap is visible to people who have paid: a cohort participant signs into
// /learn successfully and then every question request answers 402, because
// nothing ever grants them access. Confirmed in KnowsiaApp's Railway logs
// (`pin-login 200 → auth/me 200 → questions 402`).
//
// Unlike the self-paced LMS grant above, this one IS automatic on the paid
// transition — that is the seam as specified, and it is the cross-sell the
// convergence exists for. It fires only from the real-money path, never from
// runZeroFeeEnrollmentSideEffects: a free webinar seat must not hand out paid
// question-bank access.
//
// Two rules inherited from Doc 19 and honoured on the KnowsiaApp side:
//   (a) the grant carries an explicit PERIOD, never an open-ended tier change;
//   (b) it travels as its own service-key call, so the handoff/PIN payloads
//       stay identity-only (BR-45).
// Idempotent over there: a repeat with a shorter or equal period changes
// nothing, so fire-and-forget retries are safe.

// HOW LONG a cohort purchase should unlock the question bank is a COMMERCIAL
// decision, not a technical one, and it is not yet answered anywhere.
// Doc 19 says "course duration", but a batch runs 2–5 days — three days of
// question-bank access is not a cross-sell, it is a rounding error. 180 days
// is used as a deliberate placeholder: long enough to carry a candidate to
// their next sitting, which is the behaviour this seam is meant to buy.
// Override with QUESTION_BANK_ACCESS_DAYS; KnowsiaApp accepts 1–730.
const DEFAULT_QUESTION_BANK_ACCESS_DAYS = 180;

function questionBankAccessDays(): number {
  const raw = Number.parseInt(process.env.QUESTION_BANK_ACCESS_DAYS ?? '', 10);
  if (!Number.isFinite(raw)) return DEFAULT_QUESTION_BANK_ACCESS_DAYS;
  return Math.min(730, Math.max(1, raw));
}

export type QuestionBankGrantOutcome =
  | 'granted'
  | 'skipped_not_configured'
  | 'skipped_gated'
  | 'failed';

export async function grantQuestionBankAccessSystem(
  registrationId: string,
  accessDays = questionBankAccessDays(),
): Promise<QuestionBankGrantOutcome> {
  if (!isKnowsiaAppLmsConfigured()) return 'skipped_not_configured';

  // Same context the LMS grant needs — participant identity plus the course
  // code, which travels as `source` so a grant can be traced to what bought it.
  const context = await knowsiaAppRepository.selectLmsGrantContextSystem(registrationId);
  if (!context || context.participantDeleted) return 'skipped_gated';

  const base = process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/service/auth/question-bank-access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY!,
      },
      body: JSON.stringify({
        email: context.participantEmail,
        name: context.participantFullName,
        phone: context.participantPhone,
        participant_id: context.participantId,
        access_days: accessDays,
        source: context.courseCode,
      }),
    });
  } catch (err) {
    captureToSentry(err, { job: 'knowsia_app_question_bank_grant', registrationId });
    console.error('[knowsia app question bank grant]', err);
    return 'failed';
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    captureToSentry(
      new Error(`Question-bank grant failed (${response.status}): ${body.slice(0, 300)}`),
      { job: 'knowsia_app_question_bank_grant', registrationId },
    );
    console.error('[knowsia app question bank grant]', response.status, body.slice(0, 300));
    return 'failed';
  }
  return 'granted';
}

// The other half of the rule: access bought by a payment ends when that payment
// is undone. Called on refund and on cancellation.
export async function revokeQuestionBankAccessSystem(
  registrationId: string,
): Promise<QuestionBankGrantOutcome> {
  if (!isKnowsiaAppLmsConfigured()) return 'skipped_not_configured';

  const context = await knowsiaAppRepository.selectLmsGrantContextSystem(registrationId);
  if (!context) return 'skipped_gated';

  const base = process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/api/v1/service/auth/question-bank-access/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY!,
      },
      body: JSON.stringify({ participant_id: context.participantId, email: context.participantEmail }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[knowsia app question bank revoke]', response.status, body.slice(0, 300));
      return 'failed';
    }
  } catch (err) {
    captureToSentry(err, { job: 'knowsia_app_question_bank_revoke', registrationId });
    console.error('[knowsia app question bank revoke]', err);
    return 'failed';
  }
  return 'granted';
}

// One self-paced enrolment as the portal dashboard shows it.
export interface StudentLmsCourse {
  courseId: string;
  title: string;
  totalLessons: number;
  progressPercentage: number;
  status: string;
  completedAt: string | null;
  expiresAt: string | null;
  lastAccessedAt: string | null;
}

// The study-world summary for the merged portal dashboard (founder
// direction 2026-08-23: ONE dashboard). Read-only, fail-soft: null hides
// the whole section — the live half of the dashboard must never wait on or
// break over the study platform.
export async function getStudentLmsCoursesSystem(
  participantId: string,
): Promise<StudentLmsCourse[] | null> {
  if (!isKnowsiaAppLmsConfigured()) return null;

  const base = process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
  try {
    const response = await fetch(
      `${base}/api/v1/service/lms/participants/${encodeURIComponent(participantId)}/enrolments`,
      {
        headers: { 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! },
        // The dashboard is interactive; a slow study platform must not hang it.
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      enrolments?: Array<{
        course_id: string;
        title: string;
        total_lessons: number;
        progress_percentage: number;
        status: string;
        completed_at: string | null;
        expires_at: string | null;
        last_accessed_at: string | null;
      }>;
    };
    return (body.enrolments ?? []).map((row) => ({
      courseId: row.course_id,
      title: row.title,
      totalLessons: row.total_lessons,
      progressPercentage: row.progress_percentage,
      status: row.status,
      completedAt: row.completed_at,
      expiresAt: row.expires_at,
      lastAccessedAt: row.last_accessed_at,
    }));
  } catch (err) {
    console.error('[knowsia app lms courses]', err);
    return null;
  }
}

// The staff-facing entry: role-checked and THROWING, because a human pressed
// a button and must see why it did not work — the opposite posture from the
// non-throwing System caller above. Days are required: staff grants to live
// participants are time-boxed by rule; permanent access is a purchase, not a
// grant.
export async function grantLmsAccess(
  registrationId: string,
  accessDays: number,
): Promise<{ outcome: 'granted'; accessDays: number }> {
  await usersService.requireRole(['admin', 'management']);

  const outcome = await grantLmsAccessSystem(registrationId, accessDays);
  switch (outcome) {
    case 'granted':
      return { outcome: 'granted', accessDays };
    case 'skipped_not_configured':
      throw new AppError(
        'NOT_CONFIGURED',
        'The study platform connection is not configured on this deployment.',
        503,
      );
    case 'skipped_gated':
      throw new AppError('NOT_FOUND', 'No such registration, or the participant was removed.', 404);
    case 'skipped_no_matching_course':
      throw new AppError(
        'NO_MATCHING_COURSE',
        'No self-paced course exists for this programme yet — import its videos in the study platform first.',
        409,
      );
    default:
      throw new AppError('UPSTREAM_ERROR', 'The study platform rejected the grant. Try again.', 502);
  }
}
