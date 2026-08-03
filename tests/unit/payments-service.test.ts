import { beforeEach, describe, expect, it, vi } from 'vitest';

const paymentsRepositoryMock = {
  selectPaymentByRegistrationId: vi.fn(),
  updatePaymentByRegistrationId: vi.fn(),
  updatePaymentDiscount: vi.fn(),
  selectPaymentByRegistrationIdSystem: vi.fn(),
  selectInstallmentCountForRegistration: vi.fn(),
  insertInstallments: vi.fn(),
  selectInstallmentsForRegistration: vi.fn(),
  updateInstallmentAmountPaid: vi.fn(),
  updateInstallmentAmountDue: vi.fn(),
  selectDueSecondInstallments: vi.fn(),
  selectPendingPaymentSubmissionForRegistration: vi.fn(),
  insertPaymentSubmissionSystem: vi.fn(),
  selectPaymentSubmissionsForRegistrationSystem: vi.fn(),
  selectPaymentSubmissions: vi.fn(),
  selectPaymentSubmissionById: vi.fn(),
  updatePaymentSubmission: vi.fn(),
  selectPaymentSubmissionContext: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const sendEmailOnceMock = vi.fn();
const sendWhatsappOnceMock = vi.fn();
const sendSmsOnceMock = vi.fn();
const opportunitiesServiceMock = {
  markWonByRegistrationId: vi.fn(),
};
const leadsServiceMock = {
  markEnrolledByRegistrationId: vi.fn(),
};
const r2ClientMock = {
  isR2Configured: vi.fn(),
  uploadObject: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
};
const partnersServiceMock = {
  accrueCommissionOnPaymentSystem: vi.fn(),
};

vi.mock('@/modules/payments/repository', () => paymentsRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/communications/service', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
  sendWhatsappOnce: (...args: unknown[]) => sendWhatsappOnceMock(...args),
  sendSmsOnce: (...args: unknown[]) => sendSmsOnceMock(...args),
}));
vi.mock('@/modules/opportunities/service', () => opportunitiesServiceMock);
vi.mock('@/modules/leads/service', () => leadsServiceMock);
vi.mock('@/lib/r2/client', () => r2ClientMock);
vi.mock('@/modules/partners/service', () => partnersServiceMock);

const {
  updatePaymentByStaff,
  applyDiscount,
  setUpTwoInstallmentPlan,
  setUpInstallmentPlanForRegistration,
  reconcileInstallments,
  rebalanceInstallmentsForDiscount,
  getDueInstallmentReminderCandidates,
  submitPaymentProofSystem,
  listPaymentSubmissions,
  getPaymentSubmissionSlipUrl,
  reviewPaymentSubmission,
} = await import('@/modules/payments/service');
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
  opportunitiesServiceMock.markWonByRegistrationId.mockResolvedValue(undefined);
  leadsServiceMock.markEnrolledByRegistrationId.mockResolvedValue(undefined);
  paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([]);
  paymentsRepositoryMock.updateInstallmentAmountPaid.mockResolvedValue(undefined);
  paymentsRepositoryMock.updateInstallmentAmountDue.mockResolvedValue(undefined);
  partnersServiceMock.accrueCommissionOnPaymentSystem.mockResolvedValue(undefined);
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

  it('marks the linked sales opportunity as Won on the transition to Paid', async () => {
    await updatePaymentByStaff('reg-1', { amountPaid: 1200, paymentMethod: 'Bank Transfer' });
    expect(opportunitiesServiceMock.markWonByRegistrationId).toHaveBeenCalledWith('reg-1');
  });

  it('marks the linked lead as Enrolled on the transition to Paid, non-blockingly', async () => {
    leadsServiceMock.markEnrolledByRegistrationId.mockRejectedValue(new Error('lead sync down'));
    await expect(
      updatePaymentByStaff('reg-1', { amountPaid: 1200, paymentMethod: 'Bank Transfer' }),
    ).resolves.toBeDefined();
    expect(leadsServiceMock.markEnrolledByRegistrationId).toHaveBeenCalledWith('reg-1');
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

describe('Knowsia Growth Partner Programme — commission accrual on the Paid transition (2026-08-02)', () => {
  it('accrues using the ACTUAL amount paid, only on the transition to Paid', async () => {
    await updatePaymentByStaff('reg-1', { amountPaid: 1200, paymentMethod: 'Bank Transfer' });
    expect(partnersServiceMock.accrueCommissionOnPaymentSystem).toHaveBeenCalledWith('reg-1', 1200);
  });

  it('never accrues for a part payment (still Pending/Part Payment, not yet Paid)', async () => {
    paymentsRepositoryMock.updatePaymentByRegistrationId.mockResolvedValue(
      existingPayment({ amount_paid: 400, balance: 800, payment_status: 'Part Payment' }),
    );
    await updatePaymentByStaff('reg-1', { amountPaid: 400, paymentMethod: 'MTN MoMo' });
    expect(partnersServiceMock.accrueCommissionOnPaymentSystem).not.toHaveBeenCalled();
  });

  it('never re-accrues on a payment that was already Paid (EC-05 double-mark)', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ amount_paid: 1200, balance: 0, payment_status: 'Paid' }),
    );
    await updatePaymentByStaff('reg-1', { amountPaid: 1200, paymentMethod: 'Bank Transfer' });
    expect(partnersServiceMock.accrueCommissionOnPaymentSystem).not.toHaveBeenCalled();
  });

  it('a commission-accrual failure never fails the payment update itself', async () => {
    partnersServiceMock.accrueCommissionOnPaymentSystem.mockRejectedValue(new Error('db down'));
    await expect(
      updatePaymentByStaff('reg-1', { amountPaid: 1200, paymentMethod: 'Bank Transfer' }),
    ).resolves.toBeDefined();
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

  // Before 202608030048_free_events.sql this case was silently broken:
  // fn_derive_payment_status tested amount_paid <= 0 first, so waiving 100%
  // of a never-paid fee left the row 'Unpaid' and none of the enrollment side
  // effects ever fired — no confirmation, no Zoom join link — while the
  // reminder cron kept chasing them for GHS 0.00.
  it('runs the zero-fee enrollment side effects (not a payment receipt) when a waiver closes a never-paid balance', async () => {
    usersServiceMock.requireRole.mockResolvedValue(ADMIN_STAFF);
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 0, payment_status: 'Unpaid' }),
    );
    paymentsRepositoryMock.updatePaymentDiscount.mockResolvedValue(
      existingPayment({
        course_fee: 0,
        original_fee: 1200,
        discount_amount: 1200,
        amount_paid: 0,
        payment_status: 'Paid',
      }),
    );

    const result = await applyDiscount('reg-1', { discountAmount: 1200, reason: 'Full waiver' });

    expect(result.paymentStatus).toBe('Paid');
    // The enrollment effects that matter still run...
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'whatsapp_invite');
    expect(opportunitiesServiceMock.markWonByRegistrationId).toHaveBeenCalledWith('reg-1');
    expect(leadsServiceMock.markEnrolledByRegistrationId).toHaveBeenCalledWith('reg-1');
    // ...but no "we received your payment of GHS 0.00", and no commission on
    // money that was never collected.
    expect(sendEmailOnceMock).not.toHaveBeenCalledWith('reg-1', 'payment_confirmation');
    expect(partnersServiceMock.accrueCommissionOnPaymentSystem).not.toHaveBeenCalled();
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

const FAR_FUTURE_START = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const NEAR_FUTURE_START = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

describe('setUpTwoInstallmentPlan — simple fixed-split payment plan (founder-approved 2026-07-24)', () => {
  beforeEach(() => {
    paymentsRepositoryMock.selectPaymentByRegistrationIdSystem.mockResolvedValue(
      existingPayment({ id: 'pay-1', payment_status: 'Unpaid' }),
    );
    paymentsRepositoryMock.selectInstallmentCountForRegistration.mockResolvedValue(0);
    paymentsRepositoryMock.insertInstallments.mockResolvedValue(undefined);
  });

  it('splits the course fee 50/50 across two installments', async () => {
    await setUpTwoInstallmentPlan('reg-1', { courseFee: 1200, batchStartDate: FAR_FUTURE_START });

    expect(paymentsRepositoryMock.insertInstallments).toHaveBeenCalledWith([
      expect.objectContaining({ installment_number: 1, amount_due: 600 }),
      expect.objectContaining({ installment_number: 2, amount_due: 600 }),
    ]);
  });

  it('handles an odd fee without losing a cent (remainder goes to the second installment)', async () => {
    await setUpTwoInstallmentPlan('reg-1', { courseFee: 1201, batchStartDate: FAR_FUTURE_START });

    const [[rows]] = paymentsRepositoryMock.insertInstallments.mock.calls;
    expect(rows[0].amount_due + rows[1].amount_due).toBe(1201);
  });

  it('rejects when the payment is not Unpaid', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationIdSystem.mockResolvedValue(
      existingPayment({ payment_status: 'Part Payment' }),
    );
    await expect(
      setUpTwoInstallmentPlan('reg-1', { courseFee: 1200, batchStartDate: FAR_FUTURE_START }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(paymentsRepositoryMock.insertInstallments).not.toHaveBeenCalled();
  });

  it('rejects when a plan already exists for this registration', async () => {
    paymentsRepositoryMock.selectInstallmentCountForRegistration.mockResolvedValue(2);
    await expect(
      setUpTwoInstallmentPlan('reg-1', { courseFee: 1200, batchStartDate: FAR_FUTURE_START }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(paymentsRepositoryMock.insertInstallments).not.toHaveBeenCalled();
  });

  it('rejects when the course starts too soon for a second installment date', async () => {
    await expect(
      setUpTwoInstallmentPlan('reg-1', { courseFee: 1200, batchStartDate: NEAR_FUTURE_START }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(paymentsRepositoryMock.insertInstallments).not.toHaveBeenCalled();
  });

  it('rejects when no payment record exists', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationIdSystem.mockResolvedValue(null);
    await expect(
      setUpTwoInstallmentPlan('reg-1', { courseFee: 1200, batchStartDate: FAR_FUTURE_START }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('setUpInstallmentPlanForRegistration — staff-facing variant (Admin Assistant write action)', () => {
  beforeEach(() => {
    usersServiceMock.requireRole.mockResolvedValue(FINANCE_STAFF);
    paymentsRepositoryMock.selectPaymentByRegistrationIdSystem.mockResolvedValue(
      existingPayment({ id: 'pay-1', payment_status: 'Unpaid' }),
    );
    paymentsRepositoryMock.selectInstallmentCountForRegistration.mockResolvedValue(0);
    paymentsRepositoryMock.insertInstallments.mockResolvedValue(undefined);
  });

  it('requires finance or admin, then shares the exact same validation/row logic as the portal path', async () => {
    await setUpInstallmentPlanForRegistration('reg-1', {
      courseFee: 1200,
      batchStartDate: FAR_FUTURE_START,
    });

    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'finance']);
    expect(paymentsRepositoryMock.insertInstallments).toHaveBeenCalledWith([
      expect.objectContaining({ installment_number: 1, amount_due: 600 }),
      expect.objectContaining({ installment_number: 2, amount_due: 600 }),
    ]);
  });

  it('rejects a non-finance/admin caller before touching the payment', async () => {
    usersServiceMock.requireRole.mockRejectedValue(
      Object.assign(new Error('Your role does not permit this action.'), { code: 'FORBIDDEN' }),
    );

    await expect(
      setUpInstallmentPlanForRegistration('reg-1', {
        courseFee: 1200,
        batchStartDate: FAR_FUTURE_START,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(paymentsRepositoryMock.insertInstallments).not.toHaveBeenCalled();
  });

  it('still rejects when the course starts too soon, same as the portal path', async () => {
    await expect(
      setUpInstallmentPlanForRegistration('reg-1', {
        courseFee: 1200,
        batchStartDate: NEAR_FUTURE_START,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(paymentsRepositoryMock.insertInstallments).not.toHaveBeenCalled();
  });
});

describe('reconcileInstallments — redistributes amount_paid across installments in order', () => {
  function installmentRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'inst-1',
      installment_number: 1,
      amount_due: '600.00',
      amount_paid: '0.00',
      due_date: '2026-08-01',
      payment_status: 'Pending',
      ...overrides,
    };
  }

  it('does nothing when no plan exists', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([]);
    await reconcileInstallments('reg-1', 300);
    expect(paymentsRepositoryMock.updateInstallmentAmountPaid).not.toHaveBeenCalled();
  });

  it('allocates a partial payment entirely to the first installment', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([
      installmentRow({ id: 'inst-1', installment_number: 1, amount_due: '600.00' }),
      installmentRow({ id: 'inst-2', installment_number: 2, amount_due: '600.00' }),
    ]);

    await reconcileInstallments('reg-1', 300);

    expect(paymentsRepositoryMock.updateInstallmentAmountPaid).toHaveBeenCalledWith(
      'inst-1',
      300,
    );
    expect(paymentsRepositoryMock.updateInstallmentAmountPaid).not.toHaveBeenCalledWith(
      'inst-2',
      expect.anything(),
    );
  });

  it('fills the first installment before spilling over into the second', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([
      installmentRow({ id: 'inst-1', installment_number: 1, amount_due: '600.00' }),
      installmentRow({ id: 'inst-2', installment_number: 2, amount_due: '600.00' }),
    ]);

    await reconcileInstallments('reg-1', 900);

    expect(paymentsRepositoryMock.updateInstallmentAmountPaid).toHaveBeenCalledWith(
      'inst-1',
      600,
    );
    expect(paymentsRepositoryMock.updateInstallmentAmountPaid).toHaveBeenCalledWith(
      'inst-2',
      300,
    );
  });

  it('does not re-write an installment whose allocation has not changed', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([
      installmentRow({ id: 'inst-1', installment_number: 1, amount_due: '600.00', amount_paid: '600.00' }),
    ]);

    await reconcileInstallments('reg-1', 600);

    expect(paymentsRepositoryMock.updateInstallmentAmountPaid).not.toHaveBeenCalled();
  });
});

describe('getDueInstallmentReminderCandidates', () => {
  it('maps repository rows to camelCase', async () => {
    paymentsRepositoryMock.selectDueSecondInstallments.mockResolvedValue([
      { registration_id: 'reg-1', amount_due: '600.00', due_date: '2026-08-01' },
    ]);

    const result = await getDueInstallmentReminderCandidates(3);

    expect(paymentsRepositoryMock.selectDueSecondInstallments).toHaveBeenCalledWith(3);
    expect(result).toEqual([{ registrationId: 'reg-1', amountDue: 600, dueDate: '2026-08-01' }]);
  });
});

describe('rebalanceInstallmentsForDiscount — keeps a payment plan in sync with a discount (fixes the known limitation)', () => {
  function installmentRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'inst-1',
      installment_number: 1,
      amount_due: '600.00',
      amount_paid: '0.00',
      due_date: '2026-08-01',
      payment_status: 'Pending',
      ...overrides,
    };
  }

  it('does nothing when no payment plan exists', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([]);
    await rebalanceInstallmentsForDiscount('reg-1', 900);
    expect(paymentsRepositoryMock.updateInstallmentAmountDue).not.toHaveBeenCalled();
  });

  it('re-splits the new, discounted total 50/50 across both installments', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([
      installmentRow({ id: 'inst-1', installment_number: 1, amount_due: '600.00' }),
      installmentRow({ id: 'inst-2', installment_number: 2, amount_due: '600.00' }),
    ]);

    // Discount brings the fee from 1200 to 900.
    await rebalanceInstallmentsForDiscount('reg-1', 900);

    expect(paymentsRepositoryMock.updateInstallmentAmountDue).toHaveBeenCalledWith('inst-1', 450);
    expect(paymentsRepositoryMock.updateInstallmentAmountDue).toHaveBeenCalledWith('inst-2', 450);
  });

  it('never shrinks an installment below what has already been paid on it', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([
      // Installment 1 already fully paid at 600.
      installmentRow({ id: 'inst-1', installment_number: 1, amount_due: '600.00', amount_paid: '600.00' }),
      installmentRow({ id: 'inst-2', installment_number: 2, amount_due: '600.00', amount_paid: '0.00' }),
    ]);

    // A steep discount brings the fee down to 700 — half of that (350) is
    // less than the 600 already paid on installment 1, so it must not drop.
    await rebalanceInstallmentsForDiscount('reg-1', 700);

    expect(paymentsRepositoryMock.updateInstallmentAmountDue).not.toHaveBeenCalledWith(
      'inst-1',
      expect.any(Number),
    );
    // Installment 2 absorbs the rest: 700 (new floor, since paid-so-far
    // already exceeds the discounted total) - 600 = 100.
    expect(paymentsRepositoryMock.updateInstallmentAmountDue).toHaveBeenCalledWith('inst-2', 100);
  });

  it('does not write an installment whose due amount is unchanged', async () => {
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([
      installmentRow({ id: 'inst-1', installment_number: 1, amount_due: '600.00' }),
      installmentRow({ id: 'inst-2', installment_number: 2, amount_due: '600.00' }),
    ]);

    await rebalanceInstallmentsForDiscount('reg-1', 1200); // no actual discount

    expect(paymentsRepositoryMock.updateInstallmentAmountDue).not.toHaveBeenCalled();
  });

  it('applyDiscount calls the rebalance with the new discounted fee', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 0 }),
    );
    paymentsRepositoryMock.updatePaymentDiscount.mockResolvedValue(
      existingPayment({ course_fee: 900, original_fee: 1200, discount_amount: 300 }),
    );
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockResolvedValue([
      installmentRow({ id: 'inst-1', installment_number: 1, amount_due: '600.00' }),
      installmentRow({ id: 'inst-2', installment_number: 2, amount_due: '600.00' }),
    ]);

    await applyDiscount('reg-1', { discountAmount: 300, reason: 'Corporate sponsorship' });

    expect(paymentsRepositoryMock.updateInstallmentAmountDue).toHaveBeenCalledWith('inst-1', 450);
    expect(paymentsRepositoryMock.updateInstallmentAmountDue).toHaveBeenCalledWith('inst-2', 450);
  });

  it('applyDiscount still succeeds even if the rebalance fails (non-blocking)', async () => {
    paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
      existingPayment({ course_fee: 1200, amount_paid: 0 }),
    );
    paymentsRepositoryMock.updatePaymentDiscount.mockResolvedValue(
      existingPayment({ course_fee: 900, original_fee: 1200, discount_amount: 300 }),
    );
    paymentsRepositoryMock.selectInstallmentsForRegistration.mockRejectedValue(
      new Error('db down'),
    );

    const result = await applyDiscount('reg-1', { discountAmount: 300, reason: 'Test' });
    expect(result.discountAmount).toBe(300);
  });
});

describe('Payment submissions (founder-requested 2026-08-01)', () => {
  function submissionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sub-1',
      registration_id: 'reg-1',
      method: 'MTN MoMo',
      amount: '500.00',
      transaction_reference: 'MOMO-REF-1',
      payment_date: '2026-08-01',
      slip_file_path: null,
      participant_notes: null,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      created_at: '2026-08-01T00:00:00Z',
      ...overrides,
    };
  }

  describe('submitPaymentProofSystem', () => {
    it('rejects a new submission while one is already pending', async () => {
      paymentsRepositoryMock.selectPendingPaymentSubmissionForRegistration.mockResolvedValue(
        submissionRow(),
      );

      await expect(
        submitPaymentProofSystem({
          registrationId: 'reg-1',
          method: 'MTN MoMo',
          amount: 500,
          transactionReference: 'ref',
          paymentDate: '2026-08-01',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(paymentsRepositoryMock.insertPaymentSubmissionSystem).not.toHaveBeenCalled();
    });

    it('inserts without a slip when none is provided', async () => {
      paymentsRepositoryMock.selectPendingPaymentSubmissionForRegistration.mockResolvedValue(null);
      paymentsRepositoryMock.insertPaymentSubmissionSystem.mockResolvedValue(submissionRow());

      await submitPaymentProofSystem({
        registrationId: 'reg-1',
        method: 'MTN MoMo',
        amount: 500,
        transactionReference: 'ref',
        paymentDate: '2026-08-01',
      });

      expect(r2ClientMock.uploadObject).not.toHaveBeenCalled();
      expect(paymentsRepositoryMock.insertPaymentSubmissionSystem).toHaveBeenCalledWith(
        expect.objectContaining({ slip_file_path: null }),
      );
    });

    it('uploads the slip to R2 and stores its key when R2 is configured', async () => {
      paymentsRepositoryMock.selectPendingPaymentSubmissionForRegistration.mockResolvedValue(null);
      paymentsRepositoryMock.insertPaymentSubmissionSystem.mockResolvedValue(submissionRow());
      r2ClientMock.isR2Configured.mockReturnValue(true);
      r2ClientMock.uploadObject.mockResolvedValue(undefined);

      await submitPaymentProofSystem(
        {
          registrationId: 'reg-1',
          method: 'MTN MoMo',
          amount: 500,
          transactionReference: 'ref',
          paymentDate: '2026-08-01',
        },
        { buffer: Buffer.from('fake'), contentType: 'image/png', extension: 'png' },
      );

      expect(r2ClientMock.uploadObject).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'image/png' }),
      );
      expect(paymentsRepositoryMock.insertPaymentSubmissionSystem).toHaveBeenCalledWith(
        expect.objectContaining({ slip_file_path: expect.stringContaining('reg-1/') }),
      );
    });

    it('rejects a slip upload when R2 is not configured', async () => {
      paymentsRepositoryMock.selectPendingPaymentSubmissionForRegistration.mockResolvedValue(null);
      r2ClientMock.isR2Configured.mockReturnValue(false);

      await expect(
        submitPaymentProofSystem(
          {
            registrationId: 'reg-1',
            method: 'MTN MoMo',
            amount: 500,
            transactionReference: 'ref',
            paymentDate: '2026-08-01',
          },
          { buffer: Buffer.from('fake'), contentType: 'image/png', extension: 'png' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(paymentsRepositoryMock.insertPaymentSubmissionSystem).not.toHaveBeenCalled();
    });
  });

  describe('reviewPaymentSubmission', () => {
    it('rejects reviewing a submission that no longer exists', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(null);
      await expect(reviewPaymentSubmission('sub-1', 'approved')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects reviewing a submission that has already been reviewed (no double-review)', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(
        submissionRow({ status: 'approved' }),
      );
      await expect(reviewPaymentSubmission('sub-1', 'approved')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(paymentsRepositoryMock.updatePaymentByRegistrationId).not.toHaveBeenCalled();
    });

    it('approving ADDS the submitted amount to the existing amount_paid, not replaces it', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(
        submissionRow({ amount: '500.00' }),
      );
      paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
        existingPayment({ amount_paid: 300, course_fee: 1200 }),
      );

      await reviewPaymentSubmission('sub-1', 'approved');

      expect(paymentsRepositoryMock.updatePaymentByRegistrationId).toHaveBeenCalledWith(
        'reg-1',
        expect.objectContaining({ amount_paid: 800 }), // 300 already paid + 500 claimed
      );
    });

    it('lets staff override the claimed amount/reference/date before approving', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(
        submissionRow({ amount: '500.00', transaction_reference: 'MOMO-REF-1' }),
      );
      paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
        existingPayment({ amount_paid: 0, course_fee: 1200 }),
      );

      await reviewPaymentSubmission('sub-1', 'approved', {
        amountPaid: 450,
        transactionId: 'CORRECTED-REF',
      });

      expect(paymentsRepositoryMock.updatePaymentByRegistrationId).toHaveBeenCalledWith(
        'reg-1',
        expect.objectContaining({ amount_paid: 450, transaction_id: 'CORRECTED-REF' }),
      );
    });

    it('marks the submission approved with the reviewing staff id', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(submissionRow());
      paymentsRepositoryMock.selectPaymentByRegistrationId.mockResolvedValue(
        existingPayment({ amount_paid: 0 }),
      );

      await reviewPaymentSubmission('sub-1', 'approved', undefined, 'Matches bank statement');

      expect(paymentsRepositoryMock.updatePaymentSubmission).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({
          status: 'approved',
          reviewed_by: 'staff-fin-1',
          review_note: 'Matches bank statement',
        }),
      );
    });

    it('rejecting never touches payments — only the submission row changes', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(submissionRow());

      await reviewPaymentSubmission('sub-1', 'rejected', undefined, 'Reference does not match');

      expect(paymentsRepositoryMock.updatePaymentByRegistrationId).not.toHaveBeenCalled();
      expect(paymentsRepositoryMock.updatePaymentSubmission).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ status: 'rejected', review_note: 'Reference does not match' }),
      );
    });
  });

  describe('listPaymentSubmissions / getPaymentSubmissionSlipUrl', () => {
    it('joins participant/course context onto each submission', async () => {
      paymentsRepositoryMock.selectPaymentSubmissions.mockResolvedValue([submissionRow()]);
      paymentsRepositoryMock.selectPaymentSubmissionContext.mockResolvedValue(
        new Map([['reg-1', { participantName: 'Ama Owusu', courseName: 'AI02', cohortLabel: 'AUG-2026' }]]),
      );

      const result = await listPaymentSubmissions();

      expect(result).toEqual([
        expect.objectContaining({
          id: 'sub-1',
          participantName: 'Ama Owusu',
          courseName: 'AI02',
          cohortLabel: 'AUG-2026',
        }),
      ]);
    });

    it('returns a signed R2 url for a submission with a slip', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(
        submissionRow({ slip_file_path: 'reg-1/abc.png' }),
      );
      r2ClientMock.getSignedDownloadUrl.mockResolvedValue('https://r2.example/signed');

      const url = await getPaymentSubmissionSlipUrl('sub-1');

      expect(r2ClientMock.getSignedDownloadUrl).toHaveBeenCalledWith('reg-1/abc.png');
      expect(url).toBe('https://r2.example/signed');
    });

    it('404s when the submission has no slip on file', async () => {
      paymentsRepositoryMock.selectPaymentSubmissionById.mockResolvedValue(
        submissionRow({ slip_file_path: null }),
      );
      await expect(getPaymentSubmissionSlipUrl('sub-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
