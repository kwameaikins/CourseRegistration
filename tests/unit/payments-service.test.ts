import { beforeEach, describe, expect, it, vi } from 'vitest';

const paymentsRepositoryMock = {
  selectPaymentByRegistrationId: vi.fn(),
  updatePaymentByRegistrationId: vi.fn(),
  updatePaymentDiscount: vi.fn(),
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

const { updatePaymentByStaff, applyDiscount } = await import('@/modules/payments/service');
const { paymentUpdateSchema, paymentDiscountSchema } = await import('@/modules/payments/types');

const ADMIN_STAFF = {
  id: 'staff-admin-1',
  userId: 'auth-2',
  fullName: 'Ama Admin',
  email: 'admin@business.com',
  role: 'admin' as const,
  isActive: true,
  createdAt: '2026-06-01T00:00:00Z',
};

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
    original_fee: null,
    discount_amount: 0,
    discount_reason: null,
    discount_granted_by: null,
    discount_granted_at: null,
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

describe('applyDiscount — staff-granted discretionary discount / fee waiver', () => {
  beforeEach(() => {
    paymentsRepositoryMock.updatePaymentDiscount.mockResolvedValue(
      existingPayment({
        course_fee: 900,
        original_fee: 1200,
        discount_amount: 300,
        discount_reason: 'Corporate sponsorship',
        discount_granted_by: 'staff-fin-1',
        payment_status: 'Unpaid',
      }),
    );
  });

  it('lets finance apply a partial discount that leaves a positive balance', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 0 }),
    );

    const result = await applyDiscount('reg-1', { discountAmount: 300, reason: 'Corporate sponsorship' });

    expect(paymentsRepositoryMock.updatePaymentDiscount).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({
        course_fee: 900,
        original_fee: 1200,
        discount_amount: 300,
        discount_reason: 'Corporate sponsorship',
        discount_granted_by: 'staff-fin-1',
      }),
    );
    expect(result.originalFee).toBe(1200);
    expect(result.discountAmount).toBe(300);
  });

  it('rejects a finance-granted discount that would zero the remaining balance', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 900 }),
    );

    await expect(
      applyDiscount('reg-1', { discountAmount: 300, reason: 'Full waiver attempt' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(paymentsRepositoryMock.updatePaymentDiscount).not.toHaveBeenCalled();
  });

  it('lets admin grant a discount that zeroes the remaining balance (full waiver)', async () => {
    usersServiceMock.requireRole.mockResolvedValue(ADMIN_STAFF);
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 900 }),
    );
    paymentsRepositoryMock.updatePaymentDiscount.mockResolvedValue(
      existingPayment({
        course_fee: 900,
        original_fee: 1200,
        discount_amount: 300,
        amount_paid: 900,
        payment_status: 'Paid',
      }),
    );

    const result = await applyDiscount('reg-1', { discountAmount: 300, reason: 'Full waiver' });

    expect(paymentsRepositoryMock.updatePaymentDiscount).toHaveBeenCalled();
    expect(result.paymentStatus).toBe('Paid');
  });

  it('rejects a discount exceeding the original fee', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 0 }),
    );

    await expect(
      applyDiscount('reg-1', { discountAmount: 1500, reason: 'Too much' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(paymentsRepositoryMock.updatePaymentDiscount).not.toHaveBeenCalled();
  });

  it('snapshots original_fee from the current course_fee only on the first discount for a row', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 900, original_fee: 1200, discount_amount: 300, amount_paid: 0 }),
    );

    await applyDiscount('reg-1', { discountAmount: 100, reason: 'Additional discount' });

    expect(paymentsRepositoryMock.updatePaymentDiscount).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ original_fee: 1200, discount_amount: 400, course_fee: 800 }),
    );
  });

  it('fires payment_confirmation side effects when an admin-granted discount closes the balance (no portal login token — staff-initiated)', async () => {
    usersServiceMock.requireRole.mockResolvedValue(ADMIN_STAFF);
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 1199, payment_status: 'Part Payment' }),
    );
    paymentsRepositoryMock.updatePaymentDiscount.mockResolvedValue(
      existingPayment({ course_fee: 1199, amount_paid: 1199, payment_status: 'Paid' }),
    );

    await applyDiscount('reg-1', { discountAmount: 1, reason: 'Rounding adjustment' });

    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'payment_confirmation');
  });

  it('paymentDiscountSchema rejects a non-positive amount and a too-short reason', () => {
    expect(paymentDiscountSchema.safeParse({ discountAmount: 0, reason: 'ok reason' }).success).toBe(
      false,
    );
    expect(
      paymentDiscountSchema.safeParse({ discountAmount: 50, reason: 'hi' }).success,
    ).toBe(false);
  });
});
