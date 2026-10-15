import { beforeEach, describe, expect, it, vi } from 'vitest';

// The rest of paying, from KnowsiaApp (one-portal merge Phase 3b,
// 2026-10-15): a discount code, the 50/50 payment plan, and "I paid by MoMo /
// bank transfer". Each door needs the shared key, refuses a bad id before any
// read, and hands the NAMED participant to the participant twin of the
// portal's own function (which owns the "is this theirs" check).

const portalMock = {
  applyCouponForParticipant: vi.fn(),
  setUpInstallmentPlanForParticipant: vi.fn(),
  listPaymentSubmissionsForParticipant: vi.fn(),
  submitPaymentProofForParticipant: vi.fn(),
};
vi.mock('@/modules/portal/service', () => portalMock);

const coupon = await import('@/app/api/integration/participants/[id]/coupon/[registrationId]/route');
const plan = await import('@/app/api/integration/participants/[id]/installment-plan/[registrationId]/route');
const proofs = await import('@/app/api/integration/participants/[id]/payment-submissions/[registrationId]/route');
const { nextInstallmentMinor } = await import('@/lib/knowsia-core/balance-checkout');

const PID = '11111111-1111-4111-8111-111111111111';
const RID = '22222222-2222-4222-8222-222222222222';
const KEY = 'test-shared-key';
const ctx = (id = PID, registrationId = RID) => ({ params: Promise.resolve({ id, registrationId }) });

function json(body: unknown, key: string | null = KEY) {
  return new Request('https://reg.example.com/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
}

function form(fields: Record<string, string | Blob>, key: string | null = KEY) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request('https://reg.example.com/x', { method: 'POST', headers: key ? { authorization: `Bearer ${key}` } : {}, body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
});

describe('the shared key is the only way in', () => {
  it('refuses all four without it and touches nothing', async () => {
    expect((await coupon.POST(json({ code: 'SAVE10' }, null), ctx())).status).toBe(401);
    expect((await plan.POST(json({}, null), ctx())).status).toBe(401);
    expect((await proofs.GET(new Request('https://reg.example.com/x'), ctx())).status).toBe(401);
    expect((await proofs.POST(form({}, null), ctx())).status).toBe(401);
    for (const fn of Object.values(portalMock)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('coupon', () => {
  it('applies the code for the named participant, upper-cased', async () => {
    portalMock.applyCouponForParticipant.mockResolvedValue({ discountApplied: 56, couponCode: 'SAVE10', balance: 504 });
    const r = await coupon.POST(json({ code: ' save10 ' }), ctx());
    expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual({ discountApplied: 56, couponCode: 'SAVE10' });
    expect(portalMock.applyCouponForParticipant).toHaveBeenCalledWith(PID, { registrationId: RID, code: 'SAVE10' });
  });

  it('a bad code shape or a bad id never reaches the service', async () => {
    expect((await coupon.POST(json({ code: 'x' }), ctx())).status).toBe(400);
    expect((await coupon.POST(json({ code: 'SAVE10' }), ctx('nope'))).status).toBe(404);
    expect((await coupon.POST(json({ code: 'SAVE10' }), ctx(PID, 'nope'))).status).toBe(400);
    expect(portalMock.applyCouponForParticipant).not.toHaveBeenCalled();
  });
});

describe('payment plan', () => {
  it('sets up the plan for the named participant', async () => {
    portalMock.setUpInstallmentPlanForParticipant.mockResolvedValue(undefined);
    const r = await plan.POST(json({}), ctx());
    expect(r.status).toBe(200);
    expect(portalMock.setUpInstallmentPlanForParticipant).toHaveBeenCalledWith(PID, { registrationId: RID });
  });
});

describe('payment proof', () => {
  it('lists and submits for the named participant, with an optional slip', async () => {
    portalMock.listPaymentSubmissionsForParticipant.mockResolvedValue([{ id: 's1', status: 'pending' }]);
    const list = await proofs.GET(new Request('https://reg.example.com/x', { headers: { authorization: `Bearer ${KEY}` } }), ctx());
    expect((await list.json()).data).toEqual({ submissions: [{ id: 's1', status: 'pending' }] });
    expect(portalMock.listPaymentSubmissionsForParticipant).toHaveBeenCalledWith(PID, RID);

    portalMock.submitPaymentProofForParticipant.mockResolvedValue({ id: 's2', status: 'pending' });
    const slip = new File([new Uint8Array([1, 2, 3])], 'slip.png', { type: 'image/png' });
    const r = await proofs.POST(form({ method: 'MTN MoMo', amount: '280', paymentDate: '2026-10-15', transactionReference: 'MP123', slip }), ctx());
    expect(r.status).toBe(200);
    const [pid, input, file] = portalMock.submitPaymentProofForParticipant.mock.calls[0];
    expect(pid).toBe(PID);
    expect(input).toMatchObject({ registrationId: RID, method: 'MTN MoMo', amount: 280, paymentDate: '2026-10-15', transactionReference: 'MP123' });
    expect(file).toMatchObject({ contentType: 'image/png', extension: 'png' });
  });

  it('refuses a wrong method or a slip that is not an image or PDF', async () => {
    expect((await proofs.POST(form({ method: 'Cash', amount: '280', paymentDate: '2026-10-15' }), ctx())).status).toBe(400);
    const exe = new File([new Uint8Array([1])], 'x.exe', { type: 'application/x-msdownload' });
    expect((await proofs.POST(form({ method: 'MTN MoMo', amount: '280', paymentDate: '2026-10-15', slip: exe }), ctx())).status).toBe(400);
    expect(portalMock.submitPaymentProofForParticipant).not.toHaveBeenCalled();
  });
});

describe('next instalment', () => {
  it('is the first instalment not yet covered, capped at the balance', () => {
    expect(nextInstallmentMinor([{ amount_due: 280, amount_paid: 280 }, { amount_due: 280, amount_paid: 0 }], 28000)).toBe(28000);
    expect(nextInstallmentMinor([{ amount_due: '280.00', amount_paid: '100.50' }, { amount_due: 280, amount_paid: 0 }], 45950)).toBe(17950);
    expect(nextInstallmentMinor([{ amount_due: 280, amount_paid: 0 }], 20000)).toBe(20000);
    expect(nextInstallmentMinor([], 20000)).toBeNull();
  });
});
