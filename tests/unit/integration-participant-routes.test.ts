import { beforeEach, describe, expect, it, vi } from 'vitest';

// The one-portal merge's service doors (Phase 2, 2026-10-15): KnowsiaApp reads
// a linked participant's live-class half of the portal through
// /api/integration/participants/[id]/*. Locked down here: the shared key is the
// only way in, a bad id is a 404 before any read, and each door hands the
// participant id to the participant-scoped service functions (which own the
// "is this registration theirs" check) — never to a session lookup.

const portalMock = {
  getPortalDashboardForParticipant: vi.fn(),
  getReceiptDataForParticipant: vi.fn(),
  getStatementDataForParticipantSystem: vi.fn(),
  getSessionMaterialsForParticipant: vi.fn(),
  getMaterialDownloadUrlForParticipant: vi.fn(),
};
vi.mock('@/modules/portal/service', () => portalMock);
vi.mock('@/modules/live-sessions/portal-access', () => ({ selectNextClassForParticipant: vi.fn(async () => ({ title: 'Day 1' })) }));
vi.mock('@/lib/portal/receipt-pdf', () => ({ generateReceiptPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock('@/lib/portal/statement-pdf', () => ({ generateStatementPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const dashboard = await import('@/app/api/integration/participants/[id]/dashboard/route');
const receipts = await import('@/app/api/integration/participants/[id]/receipts/[registrationId]/route');
const statement = await import('@/app/api/integration/participants/[id]/statement/route');
const materials = await import('@/app/api/integration/participants/[id]/materials/[registrationId]/route');

const PID = '11111111-1111-4111-8111-111111111111';
const RID = '22222222-2222-4222-8222-222222222222';
const MID = '33333333-3333-4333-8333-333333333333';
const KEY = 'test-shared-key';

function req(path: string, key: string | null = KEY): Request {
  return new Request(`https://reg.example.com${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
});

describe('the shared key is the only way in', () => {
  it('refuses a missing or wrong key with 401 and reads nothing', async () => {
    for (const key of [null, 'wrong']) {
      const r = await dashboard.GET(req(`/api/integration/participants/${PID}/dashboard`, key), { params: Promise.resolve({ id: PID }) });
      expect(r.status).toBe(401);
    }
    const s = await statement.GET(req(`/x`, null), { params: Promise.resolve({ id: PID }) });
    expect(s.status).toBe(401);
    expect(portalMock.getPortalDashboardForParticipant).not.toHaveBeenCalled();
    expect(portalMock.getStatementDataForParticipantSystem).not.toHaveBeenCalled();
  });

  it('refuses everything when the key is not configured', async () => {
    delete process.env.KNOWSIA_APP_SERVICE_KEY;
    const r = await dashboard.GET(req(`/x`, 'undefined'), { params: Promise.resolve({ id: PID }) });
    expect(r.status).toBe(401);
  });
});

describe('each door reads for the participant it names', () => {
  it('dashboard: live half only, with the next class', async () => {
    portalMock.getPortalDashboardForParticipant.mockResolvedValue({ fullName: 'Ama', registrations: [] });
    const r = await dashboard.GET(req(`/x`), { params: Promise.resolve({ id: PID }) });
    expect(r.status).toBe(200);
    expect(portalMock.getPortalDashboardForParticipant).toHaveBeenCalledWith(PID, { includeSelfPaced: false });
    const body = await r.json();
    expect(body.data.nextClass).toEqual({ title: 'Day 1' });
    expect(body.data.fullName).toBe('Ama');
  });

  it('a malformed id is a 404 before any read', async () => {
    const r = await dashboard.GET(req(`/x`), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(r.status).toBe(404);
    const m = await materials.GET(req(`/x`), { params: Promise.resolve({ id: PID, registrationId: 'nope' }) });
    expect(m.status).toBe(404);
    expect(portalMock.getPortalDashboardForParticipant).not.toHaveBeenCalled();
    expect(portalMock.getSessionMaterialsForParticipant).not.toHaveBeenCalled();
  });

  it('receipt and statement come back as PDFs', async () => {
    portalMock.getReceiptDataForParticipant.mockResolvedValue({});
    portalMock.getStatementDataForParticipantSystem.mockResolvedValue({ participantId: PID });
    const r = await receipts.GET(req(`/x`), { params: Promise.resolve({ id: PID, registrationId: RID }) });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(portalMock.getReceiptDataForParticipant).toHaveBeenCalledWith(PID, RID);
    const s = await statement.GET(req(`/x`), { params: Promise.resolve({ id: PID }) });
    expect(s.status).toBe(200);
    expect(portalMock.getStatementDataForParticipantSystem).toHaveBeenCalledWith(PID);
  });

  it('materials: the list, or one signed link', async () => {
    portalMock.getSessionMaterialsForParticipant.mockResolvedValue([{ id: MID, title: 'Slides' }]);
    portalMock.getMaterialDownloadUrlForParticipant.mockResolvedValue('https://files.example.com/signed');
    const list = await materials.GET(req(`/x`), { params: Promise.resolve({ id: PID, registrationId: RID }) });
    expect((await list.json()).data).toEqual([{ id: MID, title: 'Slides' }]);
    const one = await materials.GET(req(`/x?materialId=${MID}`), { params: Promise.resolve({ id: PID, registrationId: RID }) });
    expect((await one.json()).data).toEqual({ url: 'https://files.example.com/signed' });
    expect(portalMock.getMaterialDownloadUrlForParticipant).toHaveBeenCalledWith(PID, RID, MID);
    const bad = await materials.GET(req(`/x?materialId=bad`), { params: Promise.resolve({ id: PID, registrationId: RID }) });
    expect(bad.status).toBe(400);
  });
});
