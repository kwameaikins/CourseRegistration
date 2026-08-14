// Zoom API client (founder-approved 2026-07-19, attendance "Option 2").
//
// Uses a Server-to-Server OAuth app (marketplace.zoom.us → Develop →
// Server-to-Server OAuth) with scopes: meeting:write:registrant,
// report:read:list_meeting_participants (Pro plan required for reports),
// and meeting:write (course-level meeting auto-creation, system review
// 2026-07-22). Required env vars: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID,
// ZOOM_CLIENT_SECRET, ZOOM_HOST_EMAIL. When unset (pre-setup, local dev),
// isZoomConfigured() gates all calls.

const ZOOM_API_BASE = 'https://api.zoom.us/v2';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

export function isZoomConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
      process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET,
  );
}

// Meeting auto-create additionally needs a host — a distinct check so the
// existing registrant/report calls keep working even if ZOOM_HOST_EMAIL
// hasn't been set yet.
export function isZoomMeetingCreateConfigured(): boolean {
  return isZoomConfigured() && Boolean(process.env.ZOOM_HOST_EMAIL);
}

// Account-credentials tokens last 1 hour; cache with a safety margin so a
// burst of payment confirmations doesn't mint a token per call.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const basic = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`,
  ).toString('base64');
  const response = await fetch(
    `${ZOOM_TOKEN_URL}?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Zoom token request failed ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function zoomFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const result = await zoomTry<T>(path, init);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

// Zoom's "missing scope" failure (error code 4711) is a configuration state,
// not an outage: the account simply hasn't granted this app that scope yet.
// The read paths below treat it as "try the next source" rather than an
// error, so a partially-scoped app still syncs instead of silently writing
// nothing (2026-08-06: the Server-to-Server app had never been granted
// report:read:list_meeting_participants, so every nightly sync since the
// feature shipped failed into runAttendanceSync's swallowed error list).
type ZoomResult<T> =
  | { ok: true; data: T }
  | { ok: false; missingScope: boolean; message: string };

async function zoomTry<T>(path: string, init: RequestInit = {}): Promise<ZoomResult<T>> {
  const token = await getAccessToken();
  const response = await fetch(`${ZOOM_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let missingScope = false;
    try {
      missingScope = (JSON.parse(body) as { code?: number }).code === 4711;
    } catch {
      missingScope = false;
    }
    return {
      ok: false,
      missingScope,
      message: `Zoom API ${init.method ?? 'GET'} ${path} failed ${response.status}: ${body.slice(0, 300)}`,
    };
  }
  return { ok: true, data: (await response.json()) as T };
}

// A meeting UUID can contain '/' and '+' (e.g. "hsqx6pdzS4qLLrtmQ1GM8w=="),
// which Zoom requires to be double URL-encoded when used as a path segment.
// Numeric meeting IDs are unaffected by the extra pass.
function encodeMeetingId(id: string): string {
  return encodeURIComponent(encodeURIComponent(id));
}

// Registers one participant for a registration-required meeting and returns
// their personal join link. Zoom keys the registrant by email, so calling
// twice with the same email returns/updates the same registrant.
export async function addMeetingRegistrant(params: {
  meetingId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<{ registrantId: string; joinUrl: string }> {
  const data = await zoomFetch<{ registrant_id: string; join_url: string }>(
    `/meetings/${encodeURIComponent(params.meetingId)}/registrants`,
    {
      method: 'POST',
      body: JSON.stringify({
        email: params.email,
        first_name: params.firstName,
        // Zoom requires a non-empty last_name for some account locales.
        last_name: params.lastName || '-',
        auto_approve: true,
      }),
    },
  );
  return { registrantId: data.registrant_id, joinUrl: data.join_url };
}

// Non-throwing variant of addMeetingRegistrant.
//
// addMeetingRegistrant throws, and every caller of ensureZoomRegistration
// wraps it in a try/catch that only console.errors — so a PERSISTENT failure
// (the whole account's meetings not accepting registrants) looks identical to
// no failure at all. That is why zoom_registrants sat empty account-wide for a
// month while the app held meeting:write:registrant. Callers that want to
// record why it failed use this instead.
export async function tryAddMeetingRegistrant(params: {
  meetingId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<
  { ok: true; registrantId: string; joinUrl: string } | { ok: false; message: string }
> {
  const result = await zoomTry<{ registrant_id: string; join_url: string }>(
    `/meetings/${encodeURIComponent(params.meetingId)}/registrants`,
    {
      method: 'POST',
      body: JSON.stringify({
        email: params.email,
        first_name: params.firstName,
        last_name: params.lastName || '-',
        auto_approve: true,
      }),
    },
  );
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, registrantId: result.data.registrant_id, joinUrl: result.data.join_url };
}

// Whether a meeting actually accepts registrants.
//
// This is the difference between diagnosing the gap and guessing at it. Zoom's
// approval_type is the authority: 0 = automatically approve, 1 = manually
// approve, 2 = NO REGISTRATION REQUIRED. Only 2 means POST /registrants will
// fail, and no amount of scope-granting changes that — it is a property of the
// meeting, not of the app's permissions.
//
// Meetings this app creates set approval_type 0 (createCourseMeeting,
// createBatchClassroomMeeting). A meeting created by hand in the Zoom console,
// or before auto-create existed, defaults to 2.
export async function getMeetingRegistrationState(meetingId: string): Promise<{
  registrationEnabled: boolean;
  approvalType: number | null;
  registrationType: number | null;
}> {
  const data = await zoomFetch<{
    settings?: { approval_type?: number; registration_type?: number };
  }>(`/meetings/${encodeURIComponent(meetingId)}`);
  const approvalType = data.settings?.approval_type ?? null;
  return {
    registrationEnabled: approvalType === 0 || approvalType === 1,
    approvalType,
    registrationType: data.settings?.registration_type ?? null,
  };
}

// Turns registration ON for a meeting that already exists — the counterpart to
// enableCloudRecording, and the only repair for a meeting at approval_type 2.
//
// Idempotent, which matters more than it looks: this app has no Zoom
// `meeting:read` scope, so it usually CANNOT check the current setting first.
// Sending it when registration is already on is a no-op.
//
// Human-triggered only, via the registrant backfill's explicit
// enableRegistration flag and never on a dry run. Enabling registration changes
// what the meeting's plain shared join link does for everyone already holding
// it, so for a cohort mid-course it is a live behaviour change that belongs to
// a person with the schedule in front of them.
//
// PATCH /meetings/{id} answers 204 with an empty body, so it cannot go through
// zoomFetch's response.json().
export async function enableMeetingRegistration(meetingId: string): Promise<void> {
  const token = await getAccessToken();
  const path = `/meetings/${encodeURIComponent(meetingId)}`;
  const response = await fetch(`${ZOOM_API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // settings is merged by Zoom, not replaced. registration_type 1 = register
    // once, attend any occurrence, which is what a recurring classroom needs;
    // the alternative types make a student register per session.
    body: JSON.stringify({ settings: { approval_type: 0, registration_type: 1 } }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Zoom API PATCH ${path} failed ${response.status}: ${body.slice(0, 300)}`,
    );
  }
}

// Revokes a registrant's personal join link (access-grant expiry sweep,
// 2026-08-08). Zoom's registrant-status endpoint answers 204 with an empty
// body, so it cannot go through zoomFetch's response.json().
//
// 'deny' rather than DELETE /registrants/{id} deliberately: denying
// invalidates the join link while leaving the registrant on the meeting, so
// re-approving them after they pay is one call — and the person's prior
// attendance records stay attributable. A deleted registrant would have to be
// re-registered from scratch, minting a different join URL.
export async function denyMeetingRegistrant(params: {
  meetingId: string;
  registrantId: string;
  email: string;
}): Promise<void> {
  const token = await getAccessToken();
  const path = `/meetings/${encodeURIComponent(params.meetingId)}/registrants/status`;
  const response = await fetch(`${ZOOM_API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'deny',
      registrants: [{ id: params.registrantId, email: params.email }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Zoom API PUT ${path} failed ${response.status}: ${body.slice(0, 300)}`,
    );
  }
}

// Creates one persistent "classroom" meeting for a Course (system review,
// 2026-07-22) — type 3 (recurring, no fixed time) so the same meeting ID/
// link stays valid indefinitely and every Batch of the Course can reuse it,
// rather than a fresh meeting per cohort. Hosted under ZOOM_HOST_EMAIL,
// the Zoom user tied to this app's Server-to-Server OAuth account.
export async function createZoomMeeting(
  topic: string,
): Promise<{ meetingId: string; joinUrl: string }> {
  const hostEmail = process.env.ZOOM_HOST_EMAIL;
  if (!hostEmail) {
    throw new Error('ZOOM_HOST_EMAIL is not configured.');
  }
  const data = await zoomFetch<{ id: number; join_url: string }>(
    `/users/${encodeURIComponent(hostEmail)}/meetings`,
    {
      method: 'POST',
      body: JSON.stringify({
        topic,
        type: 3,
        settings: {
          approval_type: 0,
          registration_type: 1,
          waiting_room: false,
          join_before_host: true,
          // See createBatchClassroomMeeting for why cloud rather than local.
          auto_recording: 'cloud',
        },
      }),
    },
  );
  return { meetingId: String(data.id), joinUrl: data.join_url };
}

// Turns on cloud recording for a meeting that already exists.
//
// Every classroom meeting created before 2026-08-08 was created without
// auto_recording, so none of them record and none has a transcript. Changing
// the creators only helps meetings made from now on — these are the cohorts
// currently running, so they need patching in place.
//
// PATCH /meetings/{id} answers 204 with an empty body, so it cannot go
// through zoomFetch's response.json().
export async function enableCloudRecording(meetingId: string): Promise<void> {
  const token = await getAccessToken();
  const path = `/meetings/${encodeURIComponent(meetingId)}`;
  const response = await fetch(`${ZOOM_API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // settings is merged by Zoom, not replaced — sending only this key
    // leaves join_before_host, jbh_time and the registration settings alone.
    body: JSON.stringify({ settings: { auto_recording: 'cloud' } }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Zoom API PATCH ${path} failed ${response.status}: ${body.slice(0, 300)}`,
    );
  }
}

// Ghana. UTC+0 year-round with no DST, which is why passing no timezone at
// all has been numerically harmless so far — but once a meeting carries a
// real start_time, the timezone stops being cosmetic and decides when the
// join window actually opens. Matches live_sessions.timezone's default.
export const GHANA_TIMEZONE = 'Africa/Accra';

// Zoom will not create an unbounded recurring series. The documented range
// for end_times is 1-365 but the practical account limit is 50 occurrences,
// and a series that hits the cap silently ENDS EARLY — which for a
// join-before-host meeting means students locked out of the back half of
// their own course. Callers check this and fall back rather than risk it.
export const ZOOM_MAX_RECURRENCE_OCCURRENCES = 50;

// How early participants may join each session.
const JOIN_BEFORE_HOST_MINUTES = 15;

// Counts the class days between two dates, which is the occurrence count
// Zoom will generate for a weekly recurrence. Pure and exported so the
// occurrence cap above can be checked without calling Zoom.
export function countRecurrenceOccurrences(
  startDate: string,
  endDate: string,
  meetingDays: number[],
): number {
  if (meetingDays.length === 0 || endDate < startDate) return 0;
  const days = new Set(meetingDays);
  let count = 0;
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    // Zoom's weekly_days encoding is 1 = Sunday ... 7 = Saturday, and
    // getUTCDay() returns 0 = Sunday, hence the +1.
    if (days.has(cursor.getUTCDay() + 1)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function minutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

// A classroom that is only open around class time (founder-flagged
// 2026-08-08).
//
// The difference from createZoomMeeting above is the meeting TYPE, and it is
// the whole point. Type 3 (recurring, no fixed time) has no start_time, so
// Zoom's jbh_time has nothing to measure from and stays 0 — the room is open
// at any hour, forever. Type 8 (recurring, FIXED time) gives every occurrence
// a real start, so `jbh_time: 15` means exactly what it says: participants
// can join from 15 minutes before class and not otherwise.
//
// join_before_host stays TRUE deliberately. It is not a hole here — with a
// fixed schedule it is what lets class start without someone having to
// remember to host, which is the behaviour this business actually relies on.
// Turning it off would need a host present for every session.
//
// Scoped per BATCH rather than per Course, unavoidably: cohorts of the same
// course run on different dates, and a fixed-time meeting can only carry one
// schedule.
export async function createBatchClassroomMeeting(params: {
  topic: string;
  startDate: string;
  startTime: string;
  endTime: string;
  endDate: string;
  meetingDays: number[];
}): Promise<{ meetingId: string; joinUrl: string }> {
  const hostEmail = process.env.ZOOM_HOST_EMAIL;
  if (!hostEmail) {
    throw new Error('ZOOM_HOST_EMAIL is not configured.');
  }

  const duration = minutesBetween(params.startTime, params.endTime);
  if (duration <= 0) {
    throw new Error('Batch end time must be after its start time.');
  }

  const occurrences = countRecurrenceOccurrences(
    params.startDate,
    params.endDate,
    params.meetingDays,
  );
  if (occurrences === 0) {
    throw new Error('This batch has no class days between its start and end dates.');
  }
  if (occurrences > ZOOM_MAX_RECURRENCE_OCCURRENCES) {
    throw new Error(
      `This batch needs ${occurrences} sessions, above Zoom's ${ZOOM_MAX_RECURRENCE_OCCURRENCES}-occurrence limit for a recurring meeting.`,
    );
  }

  // No trailing Z: paired with `timezone`, Zoom reads this as a LOCAL time in
  // that zone. With a Z it would be parsed as UTC, which happens to agree for
  // Ghana today but would silently be wrong for any other zone.
  const startTimeLocal = `${params.startDate}T${params.startTime.slice(0, 5)}:00`;

  const data = await zoomFetch<{ id: number; join_url: string }>(
    `/users/${encodeURIComponent(hostEmail)}/meetings`,
    {
      method: 'POST',
      body: JSON.stringify({
        topic: params.topic,
        type: 8,
        start_time: startTimeLocal,
        duration,
        timezone: GHANA_TIMEZONE,
        recurrence: {
          type: 2, // weekly
          repeat_interval: 1,
          weekly_days: params.meetingDays.join(','),
          end_date_time: `${params.endDate}T23:59:00Z`,
        },
        settings: {
          approval_type: 0,
          registration_type: 1,
          waiting_room: false,
          join_before_host: true,
          jbh_time: JOIN_BEFORE_HOST_MINUTES,
          // Cloud, not local (founder direction 2026-08-08). Only a cloud
          // recording produces a transcript Zoom's API can serve back, which
          // is what the post-session recap agent reads. A local recording
          // lives on the host's machine and is invisible to this app.
          auto_recording: 'cloud',
        },
      }),
    },
  );
  return { meetingId: String(data.id), joinUrl: data.join_url };
}

export interface ZoomParticipantRecord {
  email: string;
  name: string;
  // Set only when the participant joined through a personal registrant link.
  // The most reliable join key there is, since it needs no email or name match.
  registrantId: string;
  // Which sitting of the meeting this join belongs to. Callers group by it to
  // measure how long the session itself ran, which is the denominator for any
  // "attended X% of the session" rule.
  instanceId: string;
  joinTime: string;
  leaveTime: string;
  durationSeconds: number;
}

function secondsBetween(joinTime: string, leaveTime: string): number {
  const from = Date.parse(joinTime);
  const to = Date.parse(leaveTime);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.round((to - from) / 1000);
}

// Past-meeting participants for ONE meeting instance (numeric ID or instance
// UUID). Prefers the Report API (carries user_email, the key the sync matches
// on) and falls back to the Dashboard API when the report scope is missing —
// Dashboard returns the same roster but usually without emails, so callers
// must be able to fall back to name matching.
//
// Passing a numeric meeting ID returns only the LATEST instance. Use
// getMeetingParticipantsOn to cover a whole day.
export async function getPastMeetingParticipants(
  meetingId: string,
): Promise<ZoomParticipantRecord[]> {
  const encoded = encodeMeetingId(meetingId);
  const participants: ZoomParticipantRecord[] = [];

  let nextPageToken = '';
  let useDashboard = false;
  do {
    const query = new URLSearchParams({ page_size: '300' });
    if (nextPageToken) query.set('next_page_token', nextPageToken);
    const result = await zoomTry<{
      participants: Array<{
        user_email?: string;
        email?: string;
        name?: string;
        user_name?: string;
        registrant_id?: string;
        join_time?: string;
        leave_time?: string;
        duration?: number;
      }>;
      next_page_token?: string;
    }>(`/report/meetings/${encoded}/participants?${query.toString()}`);

    if (!result.ok) {
      if (!result.missingScope) throw new Error(result.message);
      useDashboard = true;
      break;
    }
    for (const p of result.data.participants ?? []) {
      const joinTime = p.join_time ?? '';
      const leaveTime = p.leave_time ?? '';
      participants.push({
        email: (p.user_email ?? p.email ?? '').trim().toLowerCase(),
        name: (p.name ?? p.user_name ?? '').trim(),
        registrantId: p.registrant_id ?? '',
        instanceId: meetingId,
        joinTime,
        leaveTime,
        durationSeconds: p.duration ?? secondsBetween(joinTime, leaveTime),
      });
    }
    nextPageToken = result.data.next_page_token ?? '';
  } while (nextPageToken);

  if (!useDashboard) return participants;
  return getDashboardMeetingParticipants(encoded, meetingId);
}

// Dashboard fallback. Same per-join rows as the report, but the record shape
// differs: user_name instead of name, no duration (derive it from the join /
// leave stamps), and an email only when the participant was signed in to a
// Zoom account on this Zoom account's domain.
async function getDashboardMeetingParticipants(
  encodedMeetingId: string,
  instanceId: string,
): Promise<ZoomParticipantRecord[]> {
  const participants: ZoomParticipantRecord[] = [];
  let nextPageToken = '';
  do {
    const query = new URLSearchParams({ type: 'past', page_size: '300' });
    if (nextPageToken) query.set('next_page_token', nextPageToken);
    const data = await zoomFetch<{
      participants: Array<{
        user_name?: string;
        email?: string;
        registrant_id?: string;
        join_time?: string;
        leave_time?: string;
      }>;
      next_page_token?: string;
    }>(`/metrics/meetings/${encodedMeetingId}/participants?${query.toString()}`);
    for (const p of data.participants ?? []) {
      const joinTime = p.join_time ?? '';
      const leaveTime = p.leave_time ?? '';
      participants.push({
        email: (p.email ?? '').trim().toLowerCase(),
        name: (p.user_name ?? '').trim(),
        registrantId: p.registrant_id ?? '',
        instanceId,
        joinTime,
        leaveTime,
        durationSeconds: secondsBetween(joinTime, leaveTime),
      });
    }
    nextPageToken = data.next_page_token ?? '';
  } while (nextPageToken);
  return participants;
}

// Instance UUIDs for every sitting of `meetingId` that started on `dateIso`.
//
// This matters because a numeric meeting ID resolves to the LATEST instance
// only. These classes routinely open the room several times a day (host
// setup, a test run, post-class reconnects), so keying off the numeric ID
// alone captured a one-person reconnect instead of the actual class — on
// 2026-08-06 that was 1 participant instead of 286.
//
// Sources are tried in order of precision and skipped when their scope is
// missing, so the sync improves automatically as scopes are granted.
export async function listMeetingInstancesOn(
  meetingId: string,
  dateIso: string,
): Promise<string[]> {
  const instances = await zoomTry<{
    meetings: Array<{ uuid?: string; start_time?: string }>;
  }>(`/past_meetings/${encodeMeetingId(meetingId)}/instances`);
  if (instances.ok) {
    const uuids = (instances.data.meetings ?? [])
      .filter((m) => (m.start_time ?? '').startsWith(dateIso))
      .map((m) => m.uuid ?? '')
      .filter(Boolean);
    if (uuids.length > 0) return [...new Set(uuids)];
  } else if (!instances.missingScope) {
    throw new Error(instances.message);
  }

  // Cloud-recording listing covers any instance that was recorded, which is
  // every delivered class on this account.
  const recordings = await zoomTry<{
    meetings: Array<{ id?: number | string; uuid?: string; start_time?: string }>;
  }>(`/accounts/me/recordings?from=${dateIso}&to=${dateIso}&page_size=300`);
  if (recordings.ok) {
    const uuids = (recordings.data.meetings ?? [])
      .filter((m) => String(m.id) === String(meetingId))
      .map((m) => m.uuid ?? '')
      .filter(Boolean);
    if (uuids.length > 0) return [...new Set(uuids)];
  } else if (!recordings.missingScope) {
    throw new Error(recordings.message);
  }

  // Last resort: the numeric ID, which Zoom resolves to the latest instance.
  return [meetingId];
}

// Every participant across every sitting of a meeting on one date, with
// per-instance rows concatenated. Callers aggregate per person.
export async function getMeetingParticipantsOn(
  meetingId: string,
  dateIso: string,
): Promise<ZoomParticipantRecord[]> {
  const instanceIds = await listMeetingInstancesOn(meetingId, dateIso);
  const records: ZoomParticipantRecord[] = [];
  for (const instanceId of instanceIds) {
    records.push(...(await getPastMeetingParticipants(instanceId)));
  }
  return records;
}
