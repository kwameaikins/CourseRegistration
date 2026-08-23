// Seam III of platform convergence (Coding Docs/19_Platform_Convergence.md §4,
// 2026-08-23): a registration reaching Paid here grants the person access to
// the matching self-paced course on KnowsiaApp. This module is the caller
// side — one fire-and-forget HTTP call, idempotent over there, non-throwing
// here, wired into runSettledEnrollmentSideEffects like every other
// paid-transition consequence.
//
// Configuration posture matches Zoom's: both env vars unset → the feature
// simply does not exist yet, and every call is a cheap no-op. That keeps the
// deploy order forgiving — this code can ship before KnowsiaApp is live.
import { captureToSentry } from '@/lib/errors';
import * as knowsiaAppRepository from '@/modules/knowsia-app/repository';

export function isKnowsiaAppLmsConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

export type LmsGrantOutcome =
  | 'granted'
  | 'skipped_not_configured'
  | 'skipped_gated'
  | 'skipped_no_matching_course'
  | 'failed';

export async function grantLmsAccessSystem(registrationId: string): Promise<LmsGrantOutcome> {
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
