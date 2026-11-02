import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = { selectAttendanceForLmsExport: vi.fn() };

vi.mock('@/modules/attendance/repository', () => repositoryMock);
vi.mock('@/modules/users/service', () => ({ requireRole: vi.fn() }));
vi.mock('@/modules/communications/service', () => ({}));
vi.mock('@/lib/resend/client', () => ({ sendTransactionalEmail: vi.fn() }));

const route = await import('@/app/api/integration/attendance/export/route');

const KEY = 'test-service-key';
const URL_BASE = 'http://x/api/integration/attendance/export';

function row(overrides: Record<string, unknown> = {}) {
  return {
    registrationId: 'a1111111-1111-1111-1111-111111111111',
    batchId: 'b1111111-1111-1111-1111-111111111111',
    sessionDate: '2026-10-03',
    joinTime: '2026-10-03T09:01:00Z',
    leaveTime: '2026-10-03T10:30:00Z',
    durationMinutes: 89,
    sessionMinutes: 90,
    source: 'zoom_sync',
    liveSessionId: 'c1111111-1111-1111-1111-111111111111',
    liveSessionStartsAt: '2026-10-03T09:00:00Z',
    absentCorrection: false,
    ...overrides,
  };
}

const ok = { headers: { authorization: `Bearer ${KEY}` } };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
  repositoryMock.selectAttendanceForLmsExport.mockResolvedValue([row()]);
});

describe('attendance export route', () => {
  it('rejects a missing key with 401 before reading anything', async () => {
    const res = await route.GET(new Request(URL_BASE));
    expect(res.status).toBe(401);
    expect(repositoryMock.selectAttendanceForLmsExport).not.toHaveBeenCalled();
  });

  it('rejects a wrong key with 401 before reading anything', async () => {
    const res = await route.GET(new Request(URL_BASE, { headers: { authorization: 'Bearer nope' } }));
    expect(res.status).toBe(401);
    expect(repositoryMock.selectAttendanceForLmsExport).not.toHaveBeenCalled();
  });

  it('returns ids and times only, with the live session start', async () => {
    const res = await route.GET(new Request(URL_BASE, ok));
    expect(res.status).toBe(200);
    const [first] = (await res.json()).data;
    expect(Object.keys(first).sort()).toEqual(
      [
        'absentCorrection', 'batchId', 'durationMinutes', 'joinTime', 'leaveTime', 'liveSessionId',
        'liveSessionStartsAt', 'registrationId', 'sessionDate', 'sessionMinutes', 'source',
      ].sort(),
    );
    expect(first.liveSessionStartsAt).toBe('2026-10-03T09:00:00Z');
    expect(JSON.stringify(first)).not.toMatch(/@|name/i);
    expect(repositoryMock.selectAttendanceForLmsExport).toHaveBeenCalledWith(undefined);
  });

  it('passes ?batchId through', async () => {
    await route.GET(new Request(`${URL_BASE}?batchId=b1`, ok));
    expect(repositoryMock.selectAttendanceForLmsExport).toHaveBeenCalledWith('b1');
  });

  it('carries an approved absent correction as its own flagged entry', async () => {
    repositoryMock.selectAttendanceForLmsExport.mockResolvedValue([
      row({ absentCorrection: true, durationMinutes: 0, source: 'manual_correction', liveSessionId: null, liveSessionStartsAt: null }),
    ]);
    const body = await (await route.GET(new Request(URL_BASE, ok))).json();
    expect(body.data[0]).toMatchObject({ absentCorrection: true, durationMinutes: 0, source: 'manual_correction' });
  });
});
