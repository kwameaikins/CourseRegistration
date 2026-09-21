// Knowsia LMS — the classroom (Coding Docs/26 §3, R1 — 2026-09-21).
//
// Until R4 this app SELLS the seat and OWNS the batch (decision 4), and
// mirrors both into the LMS: a batch becomes a cohort (by this app's
// batches.id as `external_ref`), a confirmed registration takes a seat (by
// registrations.id), a cancellation or transfer withdraws it, a part-payment
// access grant becomes an access grant over there. Every call is best
// effort and idempotent on the LMS's side — a retry, a duplicate delivery
// and a replay all land on the same row — and a failure is reported to
// Sentry, never thrown into the caller: the batch has been saved, the
// payment has cleared, and neither may fail because a mirror did not answer.
//
// During the DUAL RUN this app still registers people with Zoom and sends
// its own class reminders; the seat call carries the personal link this app
// minted so the LMS shows the same link, and the LMS sends nothing.
import { captureToSentry } from '@/lib/errors';

export function isLmsConfigured(): boolean {
  return Boolean((process.env.KNOWSIA_LMS_API_URL || process.env.KNOWSIA_APP_API_URL) && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  // trim(): a stray CR from a piped `vercel env add` 500'd every proxied call once (2026-08-23).
  return (process.env.KNOWSIA_LMS_API_URL || process.env.KNOWSIA_APP_API_URL!).trim().replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

async function call<T>(job: string, path: string, init: RequestInit & { ref?: string } = {}): Promise<T | null> {
  if (!isLmsConfigured()) return null;
  try {
    const response = await fetch(`${base()}${path}`, { ...init, headers: headers(), signal: AbortSignal.timeout(20_000) });
    if (response.status === 404) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`lms answered ${response.status}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  } catch (err) {
    captureToSentry(err, { job, ref: init.ref ?? '' });
    console.error(`[${job}]`, err);
    return null;
  }
}

export interface BatchMirrorInput {
  batchId: string;
  courseCode: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string | null;
  meetingDays: number[] | null;
  facilitatorName: string;
  capacity: number | null;
  isFree: boolean;
  isUnlisted: boolean;
  isActive: boolean;
  classReminderEnabled: boolean;
  zoomMeetingId: string | null;
  zoomLink: string | null;
  whatsappGroupLink: string | null;
  resourcesLink: string | null;
  zoomAccessRevokedAt?: string | null;
}

/** A batch → the LMS cohort. Idempotent on batches.id. */
export async function mirrorBatchToLms(b: BatchMirrorInput): Promise<{ cohort_id: string; created: boolean } | null> {
  return call('lms mirror batch', '/api/v1/service/lms/cohorts', {
    method: 'PUT',
    ref: b.batchId,
    body: JSON.stringify({
      external_ref: b.batchId,
      course_code: b.courseCode,
      course_title: b.courseName,
      title: `${b.courseName} — ${b.cohortLabel}`,
      start_date: b.startDate,
      end_date: b.endDate,
      start_time: b.startTime,
      end_time: b.endTime,
      meeting_days: b.meetingDays,
      timezone: 'Africa/Accra',
      tutor_name: b.facilitatorName || null,
      max_seats: b.capacity ?? undefined,
      is_free: b.isFree,
      is_unlisted: b.isUnlisted,
      is_active: b.isActive,
      reminders_enabled: b.classReminderEnabled,
      zoom_meeting_id: b.zoomMeetingId,
      zoom_join_url: b.zoomLink,
      zoom_access_revoked_at: b.zoomAccessRevokedAt ?? null,
      whatsapp_group_url: b.whatsappGroupLink,
      resources_url: b.resourcesLink,
    }),
  });
}

export interface SeatInput {
  batchId: string;
  registrationId: string;
  participantId: string;
  email: string;
  name: string;
  phone: string | null;
  seatSource: 'paid' | 'free' | 'grant' | 'corporate';
  zoomRegistrantId?: string | null;
  zoomJoinUrl?: string | null;
}

/** A confirmed registration → a seat. Idempotent on registrations.id. A
 *  cohort the LMS has not seen yet answers 404 (null here): mirror the batch
 *  first, then try again — the callers do exactly that. */
export async function grantSeatOnLms(s: SeatInput): Promise<{ id: string; created: boolean; has_personal_link: boolean } | null> {
  return call('lms grant seat', `/api/v1/service/lms/cohorts/${encodeURIComponent(s.batchId)}/members`, {
    method: 'POST',
    ref: s.registrationId,
    body: JSON.stringify({
      email: s.email,
      name: s.name,
      phone: s.phone,
      participant_id: s.participantId,
      external_ref: s.registrationId,
      seat_source: s.seatSource,
      zoom_registrant_id: s.zoomRegistrantId ?? null,
      zoom_join_url: s.zoomJoinUrl ?? null,
    }),
  });
}

export async function withdrawSeatOnLms(batchId: string, registrationId: string, reason: string): Promise<{ withdrawn: boolean } | null> {
  const qs = new URLSearchParams({ reason: reason.slice(0, 300) });
  return call('lms withdraw seat', `/api/v1/service/lms/cohorts/${encodeURIComponent(batchId)}/members/${encodeURIComponent(registrationId)}?${qs}`, {
    method: 'DELETE',
    ref: registrationId,
  });
}

export async function grantAccessOnLms(batchId: string, registrationId: string, input: { reason: 'part_payment' | 'credit' | 'goodwill' | 'transfer' | 'other'; note: string; expiresOn: string }): Promise<{ grant_id: string } | null> {
  return call('lms access grant', `/api/v1/service/lms/cohorts/${encodeURIComponent(batchId)}/members/${encodeURIComponent(registrationId)}/access`, {
    method: 'POST',
    ref: registrationId,
    body: JSON.stringify({ reason: input.reason, note: input.note, expires_on: input.expiresOn }),
  });
}
