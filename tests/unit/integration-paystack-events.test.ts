import { beforeEach, describe, expect, it, vi } from 'vitest';

// The weekly money cross-check's read of this app (2026-10-16): Paystack
// payments applied in a window — references, registrations and amounts only.

const repo = { selectPaystackPaymentEventsSystem: vi.fn() };
vi.mock('@/modules/payments/repository', () => repo);

const route = await import('@/app/api/integration/payments/paystack-events/route');
const KEY = 'test-shared-key';

function get(qs: string, key: string | null = KEY) {
  return route.GET(new Request(`https://reg.example.com/api/integration/payments/paystack-events?${qs}`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
});

describe('paystack events for the cross-check', () => {
  it('needs the shared key', async () => {
    expect((await get('since=2026-10-01T00:00:00Z&until=2026-10-08T00:00:00Z', null)).status).toBe(401);
    expect(repo.selectPaystackPaymentEventsSystem).not.toHaveBeenCalled();
  });

  it('returns the window in pesewas, nothing personal', async () => {
    repo.selectPaystackPaymentEventsSystem.mockResolvedValue([
      { registration_id: 'r1', amount: 280.5, transaction_id: 'REG-abc', recorded_at: '2026-10-02T10:00:00Z' },
    ]);
    const r = await get('since=2026-10-01T00:00:00Z&until=2026-10-08T00:00:00Z');
    expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual({
      events: [{ reference: 'REG-abc', registrationId: 'r1', amountMinor: 28050, recordedAt: '2026-10-02T10:00:00Z' }],
    });
    expect(repo.selectPaystackPaymentEventsSystem).toHaveBeenCalledWith('2026-10-01T00:00:00.000Z', '2026-10-08T00:00:00.000Z');
  });

  it('refuses a bad or over-long window', async () => {
    expect((await get('since=yesterday&until=2026-10-08T00:00:00Z')).status).toBe(400);
    expect((await get('since=2026-10-08T00:00:00Z&until=2026-10-01T00:00:00Z')).status).toBe(400);
    expect((await get('since=2026-08-01T00:00:00Z&until=2026-10-08T00:00:00Z')).status).toBe(400);
    expect(repo.selectPaystackPaymentEventsSystem).not.toHaveBeenCalled();
  });
});
