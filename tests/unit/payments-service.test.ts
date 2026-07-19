import { beforeEach, describe, expect, it, vi } from 'vitest';

const paymentsRepositoryMock = {
  selectPaymentByRegistrationId: vi.fn(),
  updatePaymentByRegistrationId: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const sendEmailOnceMock = vi.fn();
const sendWhatsappOnceMock = vi.fn();
const sendSmsOnceMock = vi.fn();

vi.mock('@/modules/payments/repository', () => paymentsRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/communications/service', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
  sendWhatsappOnce: (...args: unknown[]) => sendWhatsappOnceMock(...args),
  sendSmsOnce: (...args: unknown[]) => sendSmsOnceMock(...args),
}));

const { updatePaymentByStaff } = await import('@/modules/payments/service');
const { paymentUpdateSchema } = await import('@/modules/payments/types');

const FINANCE_STAFF = {
  id: 'staff-fin-1',
  userId: 'auth-1',
  fullName: 'Kofi Mensah',
  email: 'kofi@business.com',
  role: 'finance' as const,
  isActive: true,
  createdAt: '2026-06-01T00:00:00Z',
};

function existingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    registration_id: 'reg-1',
    course_fee: 1200,
    amount_paid: 0,
    balance: 1200,
    payment_status: 'Unpaid',
    payment_method: null,
    transaction_id: null,
    payment_date: null,
    verified_by: null,
    payment_notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue(FINANCE_STAFF);
  paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(existingPayment());
  paymentsRepositoryMock.updatePaymentByRegistrationId.mockResolvedValue(
    existingPayment({
      amount_paid: 1200,
      balance: 0,
      payment_status: 'Paid',
      payment_method: 'Bank Transfer',
      verified_by: 'staff-fin-1',
    }),
  );
  sendEmailOnceMock.mockResolvedValue('sent');
});

describe('BR-12 — verified_by is always the session staff id', () => {
  it('writes the session staff id, never a client value', async () => {
    await updatePaymentByStaff('reg-1', {
      amountPaid: 1200,
      paymentMethod: 'Bank Transfer',
      transactionId: 'GCB-REF-88213',
    });

    expect(paymentsRepositoryMock.updatePaymentByRegistrationId).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ verified_by: 'staff-fin-1' }),
    );
  });

  it('requires the finance or admin role', async () => {
    await updatePaymentByStaff('reg-1', { amountPaid: 100, paymentMethod: 'Cash' });
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['finance', 'admin']);
  });
});

describe('E07 — confirmation email only on the transition to Paid', () => {
  it('sends payment_confirmation email AND WhatsApp when status transitions Unpaid → Paid', async () => {
    await updatePaymentByStaff('reg-1', { amountPaid: 1200, paymentMethod: 'Bank Transfer' });
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'payment_confirmation');
    expect(sendWhatsappOnceMock).toHaveBeenCalledWith('reg-1', 'payment_confirmation');
  });

  it('does not send when the payment was already Paid (EC-05 double-mark)', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ amount_paid: 1200, balance: 0, payment_status: 'Paid' }),
    );
    await updatePaymentByStaff('reg-1', { amountPaid: 1200, paymentMethod: 'Bank Transfer' });
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
    expect(sendWhatsappOnceMock).not.toHaveBeenCalled();
  });

  it('does not send for a part payment', async () => {
    paymentsRepositoryMock.updatePaymentByRegistrationId.mockResolvedValue(
      existingPayment({ amount_paid: 400, balance: 800, payment_status: 'Part Payment' }),
    );
    await updatePaymentByStaff('reg-1', { amountPaid: 400, paymentMethod: 'MTN MoMo' });
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
  });
});

describe('BR-04 — the update schema has no payment_status field (T-BR04-04 support)', () => {
  it('strips unknown fields like paymentStatus from a parsed payload', () => {
    const parsed = paymentUpdateSchema.parse({
      amountPaid: 100,
      paymentMethod: 'Cash',
      paymentStatus: 'Paid', // ignored — not part of the schema
      verifiedBy: 'attacker-id', // ignored — not part of the schema
    });
    expect(parsed).not.toHaveProperty('paymentStatus');
    expect(parsed).not.toHaveProperty('verifiedBy');
  });

  it('rejects a negative amount', () => {
    const result = paymentUpdateSchema.safeParse({
      amountPaid: -5,
      paymentMethod: 'Cash',
    });
    expect(result.success).toBe(false);
  });
});
