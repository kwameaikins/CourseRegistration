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
