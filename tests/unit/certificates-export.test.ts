import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectAllCertificates: vi.fn(),
  selectMaxSerialForCourseYear: vi.fn(),
  selectCourseSerialFloor: vi.fn(),
};

vi.mock('@/modules/certificates/repository', () => repositoryMock);
vi.mock('@/modules/users/service', () => ({ requireRole: vi.fn() }));
vi.mock('@/modules/assignments/service', () => ({}));
vi.mock('@/lib/resend/client', () => ({ sendTransactionalEmail: vi.fn() }));

const { exportForLms, peekNextNumber } = await import('@/modules/certificates/service');
const exportRoute = await import('@/app/api/integration/certificates/export/route');
const nextRoute = await import('@/app/api/integration/certificates/next-number/route');

const KEY = 'test-service-key';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1111111-1111-1111-1111-111111111111',
    registration_id: null,
    certificate_number: 'KNS-CA01-2026-0021',
    recipient_name: 'Ama Owusu',
    course_title: 'Cost Accounting',
    description: '',
    hours: 6,
    cpd_credit: '6 CPD',
    issued_date: '2026-09-01',
    issued_by: null,
    recipient_email: null,
    revoked: false,
    revoked_reason: null,
    created_at: '2026-09-01T00:00:00Z',
    facilitator_name: 'Kofi',
    external_ref: 'ext-1',
    source: 'self_paced',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
  repositoryMock.selectAllCertificates.mockResolvedValue([row()]);
  repositoryMock.selectMaxSerialForCourseYear.mockResolvedValue(0);
  repositoryMock.selectCourseSerialFloor.mockResolvedValue(20);
});

describe('exportForLms', () => {
  it('maps every column to camelCase', async () => {
    const out = await exportForLms();
    expect(out[0]).toMatchObject({
      id: 'c1111111-1111-1111-1111-111111111111',
      certificateNumber: 'KNS-CA01-2026-0021',
      externalRef: 'ext-1',
      facilitatorName: 'Kofi',
      registrationId: null,
      recipientName: 'Ama Owusu',
      issuedDate: '2026-09-01',
      cpdCredit: '6 CPD',
      revoked: false,
      revokedReason: null,
      issuedBy: null,
      createdAt: '2026-09-01T00:00:00Z',
      source: 'self_paced',
    });
  });
});

describe('peekNextNumber', () => {
  it('returns the next number without inserting', async () => {
    expect(await peekNextNumber('ca01', '2026-11-01')).toBe('KNS-CA01-2026-0021');
  });
});

describe('export route', () => {
  it('rejects a missing key with 401', async () => {
    const res = await exportRoute.GET(
      new Request('http://x/api/integration/certificates/export'),
    );
    expect(res.status).toBe(401);
    expect(repositoryMock.selectAllCertificates).not.toHaveBeenCalled();
  });

  it('returns rows with the key', async () => {
    const res = await exportRoute.GET(
      new Request('http://x/api/integration/certificates/export', {
        headers: { authorization: `Bearer ${KEY}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty('certificateNumber');
    expect(body.data[0]).toHaveProperty('externalRef');
    expect(body.data[0]).toHaveProperty('facilitatorName');
    expect(body.data[0]).toHaveProperty('id');
  });
});

describe('next-number route', () => {
  it('rejects a missing key with 401', async () => {
    const res = await nextRoute.GET(
      new Request('http://x/api/integration/certificates/next-number?code=CA01&date=2026-11-01'),
    );
    expect(res.status).toBe(401);
  });

  it('answers KNS-CA01-2026-0021 for an empty CA01 with floor 20', async () => {
    const res = await nextRoute.GET(
      new Request('http://x/api/integration/certificates/next-number?code=CA01&date=2026-11-01', {
        headers: { authorization: `Bearer ${KEY}` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.certificateNumber).toBe('KNS-CA01-2026-0021');
  });

  it('400s without a code', async () => {
    const res = await nextRoute.GET(
      new Request('http://x/api/integration/certificates/next-number', {
        headers: { authorization: `Bearer ${KEY}` },
      }),
    );
    expect(res.status).toBe(400);
  });
});