import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectPaymentByTransactionIdSystem: vi.fn(),
  selectPaymentByRegistrationIdSystem: vi.fn(),
  applyWebhookPaymentSystem: vi.fn(),
};
const sendEmailOnceMock = vi.fn();

vi.mock('@/modules/payments/repository', () => repositoryMock);
vi.mock('@/modules/communications/service', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
}));

const { processWebhookEvent } = await import(
  '@/modules/payments/paystack-webhook-handler'
);

function chargeSuccessPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'charge.success',
    data: {
      reference: 'PSK-REF-99231',
      amount: 120000, // pesewas = GHS 1200.00
      channel: 'card',
      customer: { email: 'ama@example.com' },
      metadata: { registration_id: 'reg-1' },
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMock.selectPaymentByTransactionIdSystem.mockResolvedValue(null);
  repositoryMock.selectPaymentByRegistrationIdSystem.mockResolvedValue({
    id: 'pay-1',
    registration_id: 'reg-1',
    course_fee: 1200,
    amount_paid: 0,
    payment_status: 'Unpaid',
  });
  repositoryMock.applyWebhookPaymentSystem.mockResolvedValue({
    id: 'pay-1',
    registration_id: 'reg-1',
    payment_status: 'Paid',
  });
  sendEmailOnceMock.mockResolvedValue('sent');
});

describe('BR-14 — webhook idempotency (T-BR14-01 logic)', () => {
  it('processes a first-time charge.success and converts pesewas to GHS', async () => {
    const outcome = await processWebhookEvent(chargeSuccessPayload());

    expect(outcome).toEqual({ status: 'processed', paymentStatus: 'Paid' });
    expect(repositoryMock.applyWebhookPaymentSystem).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({
        amount_paid: 1200, // 120000 pesewas ÷ 100
        transaction_id: 'PSK-REF-99231',
        payment_method: 'Paystack Card',
      }),
    );
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'payment_confirmation');
  });

  it('returns already_processed for a repeated reference without touching the payment', async () => {
    repositoryMock.selectPaymentByTransactionIdSystem.mockResolvedValue({ id: 'pay-1' });

    const outcome = await processWebhookEvent(chargeSuccessPayload());

    expect(outcome).toEqual({ status: 'already_processed' });
    expect(repositoryMock.applyWebhookPaymentSystem).not.toHaveBeenCalled();
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
  });

  it('treats a unique-constraint race on transaction_id as already_processed', async () => {
    repositoryMock.applyWebhookPaymentSystem.mockRejectedValue({ code: '23505' });

    const outcome = await processWebhookEvent(chargeSuccessPayload());

    expect(outcome).toEqual({ status: 'already_processed' });
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
  });
});

describe('EC-02 — unmatched payloads acknowledged for review', () => {
  it('flags a payload without metadata.registration_id', async () => {
    const outcome = await processWebhookEvent(chargeSuccessPayload({ metadata: null }));
    expect(outcome).toEqual({ status: 'unmatched_logged_for_review' });
  });

  it('flags a registration_id with no payment record', async () => {
    repositoryMock.selectPaymentByRegistrationIdSystem.mockResolvedValue(null);
    const outcome = await processWebhookEvent(chargeSuccessPayload());
    expect(outcome).toEqual({ status: 'unmatched_logged_for_review' });
  });
});

describe('event and channel handling', () => {
  it('ignores non-charge.success events', async () => {
    const outcome = await processWebhookEvent({
      event: 'transfer.success',
      data: { reference: 'X', amount: 100 },
    });
    expect(outcome).toEqual({ status: 'ignored_event' });
  });

  it('maps mobile_money channel to MTN MoMo', async () => {
    await processWebhookEvent(chargeSuccessPayload({ channel: 'mobile_money' }));
    expect(repositoryMock.applyWebhookPaymentSystem).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ payment_method: 'MTN MoMo' }),
    );
  });

  it('adds a webhook amount on top of a prior part payment', async () => {
    repositoryMock.selectPaymentByRegistrationIdSystem.mockResolvedValue({
      id: 'pay-1',
      registration_id: 'reg-1',
      course_fee: 1200,
      amount_paid: 400,
      payment_status: 'Part Payment',
    });

    await processWebhookEvent(chargeSuccessPayload({ amount: 80000 }));

    expect(repositoryMock.applyWebhookPaymentSystem).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ amount_paid: 1200 }), // 400 + 800
    );
  });
});
