// Zoom API client (founder-approved 2026-07-19, attendance "Option 2").
//
// Uses a Server-to-Server OAuth app (marketplace.zoom.us → Develop →
// Server-to-Server OAuth) with scopes: meeting:write:registrant,
// report:read:list_meeting_participants (Pro plan required for reports).
// Required env vars: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.
// When unset (pre-setup, local dev), isZoomConfigured() gates all calls.

const ZOOM_API_BASE = 'https://api.zoom.us/v2';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

export function isZoomConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
      process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET,
  );
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
