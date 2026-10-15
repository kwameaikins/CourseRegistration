import { beforeEach, describe, expect, it, vi } from 'vitest';

// KnowsiaApp's Pay button (one-portal merge Phase 3a, 2026-10-15): a Core
// checkout for what the named participant still owes on THEIR registration.
// The amount is this app's payment row, never the caller's; a registration of
// someone else is a 404; the return address is knowsia.com only.

const payments = { selectPaymentByRegistrationIdSystem: vi.fn(), selectInstallmentsForRegistration: vi.fn(async () => []) };
const context = { selectPaymentSettledContextSystem: vi.fn() };
const core = { isCoreCheckoutOn: vi.fn(() => true), createCheckoutOnCore: vi.fn() };
vi.mock('@/modules/payments/repository', () => payments);
vi.mock('@/modules/knowsia-app/repository', () => context);
vi.mock('@/lib/knowsia-core/payments', () => core);
vi.mock('@/lib/knowsia-core/catalogue', () => ({ batchSkuCode: vi.fn(() => 'REG-ESG1-C2') }));

const route = await import('@/app/api/integration/participants/[id]/checkout/[registrationId]/route');

const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const RID = '22222222-2222-4222-8222-222222222222';
const KEY = 'test-shared-key';
const CALLBACK = `https://app.knowsia.com/live/${RID}?paid=1`;

function call(id: string, body: unknown, key: string | null = KEY) {
  const request = new Request('https://reg.example.com/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
  return route.POST(request, { params: Promise.resolve({ id, registrationId: RID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
  core.isCoreCheckoutOn.mockReturnValue(true);
  payments.selectPaymentByRegistrationIdSystem.mockResolvedValue({ balance: '560.00', amount_paid: '0', course_fee: '560.00' });
  context.selectPaymentSettledContextSystem.mockResolvedValue({
    participantId: PID, participantEmail: 'ama@example.com', participantDeleted: false, courseCode: 'ESG1', cohortLabel: 'Cohort 2',
  });
  core.createCheckoutOnCore.mockResolvedValue({
    id: 'c1', reference: 'REG-abc', authorization_url: 'https://checkout.paystack.com/abc', access_code: 'abc', amount_minor: 56000, currency: 'GHS', sku_code: 'REG-ESG1-C2', status: 'pending',
  });
});

describe('the Pay door', () => {
  it('needs the shared key', async () => {
    const r = await call(PID, { callbackUrl: CALLBACK }, null);
    expect(r.status).toBe(401);
    expect(core.createCheckoutOnCore).not.toHaveBeenCalled();
  });

  it('charges the balance on the payment row and sends the student back to the app', async () => {
    const r = await call(PID, { callbackUrl: CALLBACK });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data).toEqual({ authorizationUrl: 'https://checkout.paystack.com/abc', reference: 'REG-abc', amountMinor: 56000, currency: 'GHS' });
    expect(core.createCheckoutOnCore).toHaveBeenCalledWith(expect.objectContaining({
      registrationId: RID, participantId: PID, balanceMinor: 56000, callbackUrl: CALLBACK,
    }));
  });

  it('a registration that is not this participant\'s is a 404 and nothing is charged', async () => {
    const r = await call(OTHER, { callbackUrl: CALLBACK });
    expect(r.status).toBe(404);
    expect(core.createCheckoutOnCore).not.toHaveBeenCalled();
  });

  it('nothing owed is a 409', async () => {
    payments.selectPaymentByRegistrationIdSystem.mockResolvedValue({ balance: '0', amount_paid: '560', course_fee: '560' });
    expect((await call(PID, {})).status).toBe(409);
  });

  it('a return address off knowsia.com is refused', async () => {
    for (const callbackUrl of ['https://evil.example.com/x', 'http://app.knowsia.com/x', 'https://knowsia.com.evil.io/x']) {
      expect((await call(PID, { callbackUrl })).status).toBe(400);
    }
    expect(core.createCheckoutOnCore).not.toHaveBeenCalled();
  });

  it('on a payment plan, part=installment charges just the next instalment still owed', async () => {
    payments.selectPaymentByRegistrationIdSystem.mockResolvedValue({ balance: '400.00', amount_paid: '160', course_fee: '560.00' });
    payments.selectInstallmentsForRegistration.mockResolvedValue([
      { amount_due: 280, amount_paid: 160 }, { amount_due: 280, amount_paid: 0 },
    ] as never);
    expect((await call(PID, { callbackUrl: CALLBACK, part: 'installment' })).status).toBe(200);
    expect(core.createCheckoutOnCore).toHaveBeenLastCalledWith(expect.objectContaining({ balanceMinor: 12000, isBalance: true }));
    // Without a plan, "installment" is simply the balance.
    payments.selectInstallmentsForRegistration.mockResolvedValue([]);
    await call(PID, { part: 'installment' });
    expect(core.createCheckoutOnCore).toHaveBeenLastCalledWith(expect.objectContaining({ balanceMinor: 40000 }));
  });

  it('Core off or away is said as 503, not a broken checkout', async () => {
    core.isCoreCheckoutOn.mockReturnValue(false);
    expect((await call(PID, { callbackUrl: CALLBACK })).status).toBe(503);
  });
});
