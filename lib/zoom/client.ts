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
    throw new Error(`Zoom API ${init.method ?? 'GET'} ${path} failed ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
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
  joinTime: string;
  leaveTime: string;
  durationSeconds: number;
}

// Past-meeting participant report (requires Pro + report scope). One
// participant may appear multiple times (rejoin) — callers aggregate.
export async function getPastMeetingParticipants(
  meetingId: string,
): Promise<ZoomParticipantRecord[]> {
  const participants: ZoomParticipantRecord[] = [];
  let nextPageToken = '';
  do {
    const query = new URLSearchParams({ page_size: '300' });
    if (nextPageToken) query.set('next_page_token', nextPageToken);
    const data = await zoomFetch<{
      participants: Array<{
        user_email?: string;
        name?: string;
        join_time?: string;
        leave_time?: string;
        duration?: number;
      }>;
      next_page_token?: string;
    }>(`/report/meetings/${encodeURIComponent(meetingId)}/participants?${query.toString()}`);
    for (const p of data.participants ?? []) {
      participants.push({
        email: (p.user_email ?? '').toLowerCase(),
        name: p.name ?? '',
        joinTime: p.join_time ?? '',
        leaveTime: p.leave_time ?? '',
        durationSeconds: p.duration ?? 0,
      });
    }
    nextPageToken = data.next_page_token ?? '';
  } while (nextPageToken);
  return participants;
}
