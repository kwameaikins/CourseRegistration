import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = { selectBatchIssueContext: vi.fn() };
const assignmentsMock = { getRegistrationIdsWithSubmissionsForBatchSystem: vi.fn() };

vi.mock('@/modules/certificates/repository', () => repositoryMock);
vi.mock('@/modules/assignments/service', () => assignmentsMock);
vi.mock('@/modules/users/service', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/resend/client', () => ({ sendTransactionalEmail: vi.fn() }));

const route = await import('@/app/api/integration/certificates/eligibility/[batchId]/route');

const KEY = 'test-service-key';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    registrationId: 'r1',
    participantName: 'Ama',
    participantEmail: 'ama@example.com',
    participantDeleted: false,
    paid: true,
    feedbackSubmitted: false,
    attendedSessions: 0,
    totalSessions: 4,
    alreadyIssued: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
  assignmentsMock.getRegistrationIdsWithSubmissionsForBatchSystem.mockResolvedValue(new Set(['r4']));
  repositoryMock.selectBatchIssueContext.mockResolvedValue({
    courseCode: 'CA01',
    courseTitle: 'Cost Accounting',
    defaultHours: 6,
    defaultDescription: '',
    defaultCpdCredit: '',
    batchIsFree: false,
    candidates: [
      candidate({ registrationId: 'r1', attendedSessions: 2 }),
      candidate({ registrationId: 'r2' }),
      candidate({ registrationId: 'r3', paid: false, feedbackSubmitted: true }),
      candidate({ registrationId: 'r4' }),
      candidate({ registrationId: 'r5', attendedSessions: 1, alreadyIssued: true }),
    ],
  });
});

const call = (headers?: Record<string, string>) =>
  route.GET(new Request('http://x/api/integration/certificates/eligibility/b1', { headers }), {
    params: Promise.resolve({ batchId: 'b1' }),
  });

describe('eligibility route', () => {
  it('rejects a missing key with 401 and reads nothing', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(repositoryMock.selectBatchIssueContext).not.toHaveBeenCalled();
  });

  it('rejects a wrong key with 401', async () => {
    expect((await call({ authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('answers the eligible ids and the inputs behind each', async () => {
    const res = await call({ authorization: `Bearer ${KEY}` });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.batchIsFree).toBe(false);
    // BR-46 on a paid batch: paid AND participated. r1 attended, r4 submitted, r5 attended (issued
    // already still counts by the rule); r2 did nothing, r3 is unpaid.
    expect(data.eligibleRegistrationIds.sort()).toEqual(['r1', 'r4', 'r5']);
    const r1 = data.candidates.find((c: { registrationId: string }) => c.registrationId === 'r1');
    expect(r1).toMatchObject({
      registrationId: 'r1', paid: true, attendedSessions: 2, feedback: false, submitted: false,
    });
    expect(data.candidates).toHaveLength(5);
  });

  it('on a free batch an unpaid participant who took part is eligible, one who did nothing is not', async () => {
    const base = await repositoryMock.selectBatchIssueContext();
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      ...base,
      batchIsFree: true,
      candidates: [
        candidate({ registrationId: 'f1', paid: false, feedbackSubmitted: true }),
        candidate({ registrationId: 'f2', paid: false }),
      ],
    });
    const { data } = await (await call({ authorization: `Bearer ${KEY}` })).json();
    expect(data.batchIsFree).toBe(true);
    expect(data.eligibleRegistrationIds).toEqual(['f1']);
  });

  it('leaves a deleted participant out of the candidates and the eligible ids', async () => {
    const base = await repositoryMock.selectBatchIssueContext();
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      ...base,
      candidates: [
        candidate({ registrationId: 'd1', attendedSessions: 3, participantDeleted: true }),
        candidate({ registrationId: 'd2', attendedSessions: 3 }),
      ],
    });
    const { data } = await (await call({ authorization: `Bearer ${KEY}` })).json();
    expect(data.eligibleRegistrationIds).toEqual(['d2']);
    expect(data.candidates.map((c: { registrationId: string }) => c.registrationId)).toEqual(['d2']);
  });

  it('404s for an unknown batch', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(null);
    expect((await call({ authorization: `Bearer ${KEY}` })).status).toBe(404);
  });
});