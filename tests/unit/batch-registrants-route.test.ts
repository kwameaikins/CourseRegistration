import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = { selectBatchRegistrantsSystem: vi.fn() };
const coursesMock = { getBatchByIdSystem: vi.fn() };

vi.mock('@/modules/registrations/repository', () => repositoryMock);
vi.mock('@/modules/courses/service', () => coursesMock);

const route = await import('@/app/api/integration/batches/[batchId]/registrants/route');

const KEY = 'test-service-key';
const BATCH = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
  coursesMock.getBatchByIdSystem.mockResolvedValue({ id: BATCH, courseId: 'c1' });
  repositoryMock.selectBatchRegistrantsSystem.mockResolvedValue([
    {
      registration: {
        id: 'r1',
        registration_status: 'Registered',
        registered_at: '2026-11-01T09:00:00Z',
        lapsed_at: null,
      },
      participant: { full_name: 'Ama Mensah', email: 'ama@example.com', phone: '+233200000000' },
      payment: null,
    },
  ]);
});

const call = (batchId: string, headers?: Record<string, string>) =>
  route.GET(new Request(`http://x/api/integration/batches/${batchId}/registrants`, { headers }), {
    params: Promise.resolve({ batchId }),
  });

describe('batch registrants route', () => {
  it('rejects a missing key with 401 and reads nothing', async () => {
    const res = await call(BATCH);
    expect(res.status).toBe(401);
    expect(repositoryMock.selectBatchRegistrantsSystem).not.toHaveBeenCalled();
  });

  it('rejects a wrong key with 401', async () => {
    expect((await call(BATCH, { authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('400s a batchId that is not a UUID, before touching the data', async () => {
    const res = await call('not-a-uuid', { authorization: `Bearer ${KEY}` });
    expect(res.status).toBe(400);
    expect(repositoryMock.selectBatchRegistrantsSystem).not.toHaveBeenCalled();
  });

  it('404s for an unknown batch, even though no registrations would look the same', async () => {
    coursesMock.getBatchByIdSystem.mockResolvedValue(null);
    const res = await call(BATCH, { authorization: `Bearer ${KEY}` });
    expect(res.status).toBe(404);
    expect(repositoryMock.selectBatchRegistrantsSystem).not.toHaveBeenCalled();
  });

  it('answers the registrants, with no payment row read as Unpaid owing nothing', async () => {
    const res = await call(BATCH, { authorization: `Bearer ${KEY}` });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.batchId).toBe(BATCH);
    expect(data.registrants).toHaveLength(1);
    expect(data.registrants[0]).toMatchObject({
      registrationId: 'r1',
      fullName: 'Ama Mensah',
      paymentStatus: 'Unpaid',
      courseFee: 0,
      balance: 0,
      lapsed: false,
    });
  });
});
