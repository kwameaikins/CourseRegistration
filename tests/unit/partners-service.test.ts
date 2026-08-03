import { beforeEach, describe, expect, it, vi } from 'vitest';

// Knowsia Growth Partner Programme (founder-requested 2026-08-02, per
// Coding Docs/knowsia_growth_partner_programme.md). Covers the commission
// pipeline's core business rules: tiered rates, the Tracked (derived,
// unstored) -> Pending transition firing only on payment, the
// qualifies_at = GREATEST(...) hold-period math, the existing-lead/
// self-referral exclusions, and the payable/payout double-review guards.

const partnersRepositoryMock = {
  selectCodeByCodeSystem: vi.fn(),
  selectCodeByIdSystem: vi.fn(),
  countRedemptionsForCodeAndParticipantSystem: vi.fn(),
  selectPartnerByIdSystem: vi.fn(),
  insertCodeRedemptionSystem: vi.fn(),
  incrementCodeUsesSystem: vi.fn(),
  insertLinkClickSystem: vi.fn(),
  selectRedemptionByRegistrationSystem: vi.fn(),
  selectCommissionByRegistrationSystem: vi.fn(),
  countCommissionsForPartnerSinceSystem: vi.fn(),
  selectBatchStartDateForRegistrationSystem: vi.fn(),
  insertCommissionSystem: vi.fn(),
  selectPendingCommissionsDueSystem: vi.fn(),
  updateCommissionStatusSystem: vi.fn(),
  selectCommissionById: vi.fn(),
  updateCommissionStatus: vi.fn(),
  insertPayout: vi.fn(),
  selectPartnerById: vi.fn(),
  selectPartners: vi.fn(),
  selectCommissions: vi.fn(),
  selectCommissionContextSystem: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const coursesServiceMock = {
  getBatchByIdSystem: vi.fn(),
};

vi.mock('@/modules/partners/repository', () => partnersRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);

const {
  ambassadorRate,
  institutionalFlatFee,
  redeemCodeSystem,
  accrueCommissionOnPaymentSystem,
  runCommissionQualificationDispatch,
  markCommissionsPayable,
  recordPayout,
  previewCode,
  buildReferralUrl,
} = await import('@/modules/partners/service');

const STAFF = { id: 'staff-1', fullName: 'Jane Doe', role: 'admin' };

function partnerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    category: 'ambassador',
    full_name: 'Kojo Ambassador',
    email: 'kojo@example.com',
    phone: '+233241234567',
    company_name: null,
    tutor_id: null,
    commission_rate: null,
    payout_method: null,
    payout_details: null,
    status: 'active',
    social_links: null,
    professional_background: null,
    promotional_methods: null,
    estimated_audience_size: null,
    agreed_to_code_of_conduct: true,
    reviewed_by: null,
    reviewed_at: null,
    created_by: 'staff-1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'code-1',
    code: 'KOJO10',
    partner_id: 'partner-1',
    discount_type: 'percentage',
    discount_value: 10,
    applies_to_course_id: null,
    max_uses: null,
    uses_count: 0,
    one_per_participant: true,
    expires_at: null,
    is_active: true,
    created_by: 'staff-1',
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue(STAFF);
});

describe('ambassadorRate (doc SS2 tiers)', () => {
  it('Starter tier below 10 paid enrolments this month', () => {
    expect(ambassadorRate(0)).toBe(12);
    expect(ambassadorRate(9)).toBe(12);
  });

  it('Growth tier at the 10-enrolment boundary', () => {
    expect(ambassadorRate(10)).toBe(15);
    expect(ambassadorRate(29)).toBe(15);
  });

  it('Elite tier at the 30-enrolment boundary', () => {
    expect(ambassadorRate(30)).toBe(18);
    expect(ambassadorRate(1000)).toBe(18);
  });
});

describe('institutionalFlatFee (doc SS2 tiers)', () => {
  it('Partner tier below 50 paid enrolments this year', () => {
    expect(institutionalFlatFee(0)).toBe(30);
    expect(institutionalFlatFee(49)).toBe(30);
  });

  it('Gold tier at the 50-enrolment boundary', () => {
    expect(institutionalFlatFee(50)).toBe(40);
    expect(institutionalFlatFee(199)).toBe(40);
  });

  it('Platinum tier at the 200-enrolment boundary', () => {
    expect(institutionalFlatFee(200)).toBe(50);
    expect(institutionalFlatFee(5000)).toBe(50);
  });
});

describe('buildReferralUrl — course-specific links (2026-08-02 follow-up)', () => {
  it('builds a general link with no batchId param when none is given', () => {
    const url = buildReferralUrl('STEPHEN954');
    expect(url).toBe('https://reg.knowsia.com/r/STEPHEN954');
  });

  it('appends batchId as a query param when given', () => {
    const url = buildReferralUrl('STEPHEN954', 'batch-uuid-1');
    expect(url).toBe('https://reg.knowsia.com/r/STEPHEN954?batchId=batch-uuid-1');
  });
});

describe('previewCode', () => {
  it('rejects an unknown or inactive code', async () => {
    partnersRepositoryMock.selectCodeByCodeSystem.mockResolvedValue(null);
    const result = await previewCode('MISSING', 'batch-1');
    expect(result.valid).toBe(false);
  });

  it('rejects an expired code', async () => {
    partnersRepositoryMock.selectCodeByCodeSystem.mockResolvedValue(
      codeRow({ expires_at: '2020-01-01T00:00:00Z' }),
    );
    const result = await previewCode('KOJO10', 'batch-1');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('rejects a code that has hit its usage cap', async () => {
    partnersRepositoryMock.selectCodeByCodeSystem.mockResolvedValue(
      codeRow({ max_uses: 5, uses_count: 5 }),
    );
    const result = await previewCode('KOJO10', 'batch-1');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/usage limit/i);
  });

  it('rejects a code restricted to a different course', async () => {
    partnersRepositoryMock.selectCodeByCodeSystem.mockResolvedValue(
      codeRow({ applies_to_course_id: 'course-A' }),
    );
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue({ courseId: 'course-B' });
    const result = await previewCode('KOJO10', 'batch-1');
    expect(result.valid).toBe(false);
  });

  it('accepts a valid, unrestricted code and surfaces its discount', async () => {
    partnersRepositoryMock.selectCodeByCodeSystem.mockResolvedValue(codeRow());
    const result = await previewCode('KOJO10', 'batch-1');
    expect(result).toEqual({
      valid: true,
      discountType: 'percentage',
      discountValue: 10,
      partnerId: 'partner-1',
    });
  });
});

describe('redeemCodeSystem — records the Tracked state, never a commission (2026-08-02)', () => {
  const baseInput = {
    code: 'KOJO10',
    registrationId: 'reg-1',
    participantId: 'participant-1',
    participantEmail: 'student@example.com',
    participantPhone: '+233209999999',
    attributionMethod: 'code' as const,
    existingLeadAtRedemption: false,
    discountAmountApplied: 100,
  };

  beforeEach(() => {
    partnersRepositoryMock.selectCodeByCodeSystem.mockResolvedValue(codeRow());
    partnersRepositoryMock.countRedemptionsForCodeAndParticipantSystem.mockResolvedValue(0);
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(partnerRow());
    partnersRepositoryMock.insertCodeRedemptionSystem.mockResolvedValue({ id: 'redemption-1' });
  });

  it('never touches partner_commissions — Tracked is a derived state, not a stored row', async () => {
    await redeemCodeSystem(baseInput);
    expect(partnersRepositoryMock.insertCodeRedemptionSystem).toHaveBeenCalled();
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('blocks a second redemption of a one-per-participant code by the same participant', async () => {
    partnersRepositoryMock.countRedemptionsForCodeAndParticipantSystem.mockResolvedValue(1);
    await redeemCodeSystem(baseInput);
    expect(partnersRepositoryMock.insertCodeRedemptionSystem).not.toHaveBeenCalled();
  });

  it('flags self-referral when the registrant email matches the code partner', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(
      partnerRow({ email: 'student@example.com', phone: '+233241111111' }),
    );
    await redeemCodeSystem(baseInput);
    expect(partnersRepositoryMock.insertCodeRedemptionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ self_referral_at_redemption: true }),
    );
  });

  it('flags self-referral when the registrant phone matches the code partner', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(
      partnerRow({ email: 'someone-else@example.com', phone: '+233209999999' }),
    );
    await redeemCodeSystem(baseInput);
    expect(partnersRepositoryMock.insertCodeRedemptionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ self_referral_at_redemption: true }),
    );
  });

  it('does not flag self-referral for an unrelated registrant', async () => {
    await redeemCodeSystem(baseInput);
    expect(partnersRepositoryMock.insertCodeRedemptionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ self_referral_at_redemption: false }),
    );
  });

  it('carries the existing-lead flag straight through from the caller', async () => {
    await redeemCodeSystem({ ...baseInput, existingLeadAtRedemption: true });
    expect(partnersRepositoryMock.insertCodeRedemptionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ existing_lead_at_redemption: true }),
    );
  });

  it('silently no-ops for an unknown code (never throws at registration time)', async () => {
    partnersRepositoryMock.selectCodeByCodeSystem.mockResolvedValue(null);
    await expect(redeemCodeSystem(baseInput)).resolves.toBeUndefined();
    expect(partnersRepositoryMock.insertCodeRedemptionSystem).not.toHaveBeenCalled();
  });
});

describe('accrueCommissionOnPaymentSystem — Pending starts only once payment clears (2026-08-02)', () => {
  const REGISTRATION_ID = 'reg-1';

  function redemptionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'redemption-1',
      code_id: 'code-1',
      registration_id: REGISTRATION_ID,
      participant_id: 'participant-1',
      discount_amount_applied: 100,
      attribution_method: 'code',
      existing_lead_at_redemption: false,
      self_referral_at_redemption: false,
      created_at: '2026-08-01T00:00:00Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    partnersRepositoryMock.selectRedemptionByRegistrationSystem.mockResolvedValue(redemptionRow());
    partnersRepositoryMock.selectCodeByIdSystem.mockResolvedValue(codeRow());
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(partnerRow());
    partnersRepositoryMock.selectCommissionByRegistrationSystem.mockResolvedValue(null);
    partnersRepositoryMock.countCommissionsForPartnerSinceSystem.mockResolvedValue(0);
    partnersRepositoryMock.selectBatchStartDateForRegistrationSystem.mockResolvedValue(null);
    partnersRepositoryMock.insertCommissionSystem.mockResolvedValue({ id: 'commission-1' });
  });

  it('does nothing when the registration was never attributed to a code', async () => {
    partnersRepositoryMock.selectRedemptionByRegistrationSystem.mockResolvedValue(null);
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('withholds commission when the registrant was an existing lead', async () => {
    partnersRepositoryMock.selectRedemptionByRegistrationSystem.mockResolvedValue(
      redemptionRow({ existing_lead_at_redemption: true }),
    );
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('withholds commission for a self-referral', async () => {
    partnersRepositoryMock.selectRedemptionByRegistrationSystem.mockResolvedValue(
      redemptionRow({ self_referral_at_redemption: true }),
    );
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('does nothing for a pure-coupon code with no partner attached', async () => {
    partnersRepositoryMock.selectCodeByIdSystem.mockResolvedValue(codeRow({ partner_id: null }));
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('does nothing when the partner is suspended/pending/rejected, not active', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(partnerRow({ status: 'suspended' }));
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('never double-accrues a second time for the same registration (e.g. a part-payment top-up)', async () => {
    partnersRepositoryMock.selectCommissionByRegistrationSystem.mockResolvedValue({ id: 'commission-existing' });
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('computes the commission on the amount ACTUALLY paid, not any listed course fee', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(partnerRow({ category: 'ambassador' }));
    partnersRepositoryMock.countCommissionsForPartnerSinceSystem.mockResolvedValue(0); // Starter tier, 12%
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 850); // a discounted amount actually collected
    expect(partnersRepositoryMock.insertCommissionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ commission_amount: 102 }), // 850 * 0.12
    );
  });

  it('a tutor partner earns a flat 10% of the amount paid', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(partnerRow({ category: 'tutor' }));
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ commission_amount: 100 }),
    );
  });

  it('an institutional partner earns a tiered flat fee, not a percentage', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(partnerRow({ category: 'institutional' }));
    partnersRepositoryMock.countCommissionsForPartnerSinceSystem.mockResolvedValue(60); // Gold tier
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 5000);
    expect(partnersRepositoryMock.insertCommissionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ commission_amount: 40 }),
    );
  });

  // Free events (2026-08-03): attribution is still recorded (redeemCodeSystem
  // runs at registration regardless of fee), but nothing was collected, so
  // nothing is earned. The institutional case is the one that actually leaks
  // money without the guard — its flat fee never looks at amountPaid.
  it('accrues nothing for an institutional partner when the amount paid is zero (free event)', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(
      partnerRow({ category: 'institutional' }),
    );
    partnersRepositoryMock.countCommissionsForPartnerSinceSystem.mockResolvedValue(60);
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 0);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('accrues nothing for an ambassador or tutor partner on a zero-fee registration', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(
      partnerRow({ category: 'ambassador' }),
    );
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 0);

    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(
      partnerRow({ category: 'tutor' }),
    );
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 0);

    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('a strategic partner with no negotiated rate earns no automatic commission (doc SSD)', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(
      partnerRow({ category: 'strategic', commission_rate: null }),
    );
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).not.toHaveBeenCalled();
  });

  it('a strategic partner with a negotiated rate earns that percentage', async () => {
    partnersRepositoryMock.selectPartnerByIdSystem.mockResolvedValue(
      partnerRow({ category: 'strategic', commission_rate: 25 }),
    );
    await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
    expect(partnersRepositoryMock.insertCommissionSystem).toHaveBeenCalledWith(
      expect.objectContaining({ commission_amount: 250 }),
    );
  });

  describe('qualifies_at = GREATEST(payment + 14 days, batch start date)', () => {
    it('uses payment + 14 days when the batch has already started', async () => {
      partnersRepositoryMock.selectBatchStartDateForRegistrationSystem.mockResolvedValue('2020-01-01');
      await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
      const [[call]] = partnersRepositoryMock.insertCommissionSystem.mock.calls;
      const expected = new Date();
      expected.setDate(expected.getDate() + 14);
      expect(call.qualifies_at).toBe(expected.toISOString().slice(0, 10));
    });

    it('uses the batch start date when it is later than payment + 14 days', async () => {
      const farFuture = new Date();
      farFuture.setDate(farFuture.getDate() + 90);
      const farFutureIso = farFuture.toISOString().slice(0, 10);
      partnersRepositoryMock.selectBatchStartDateForRegistrationSystem.mockResolvedValue(farFutureIso);
      await accrueCommissionOnPaymentSystem(REGISTRATION_ID, 1000);
      const [[call]] = partnersRepositoryMock.insertCommissionSystem.mock.calls;
      expect(call.qualifies_at).toBe(farFutureIso);
    });
  });
});

describe('runCommissionQualificationDispatch — pending -> approved once qualifies_at has passed', () => {
  it('approves every commission due as of today and reports the count', async () => {
    partnersRepositoryMock.selectPendingCommissionsDueSystem.mockResolvedValue([
      { id: 'commission-1' },
      { id: 'commission-2' },
    ]);
    const result = await runCommissionQualificationDispatch(new Date('2026-09-01'));
    expect(result).toEqual({ approved: 2 });
    expect(partnersRepositoryMock.updateCommissionStatusSystem).toHaveBeenCalledWith(
      'commission-1',
      expect.objectContaining({ status: 'approved' }),
    );
    expect(partnersRepositoryMock.updateCommissionStatusSystem).toHaveBeenCalledWith(
      'commission-2',
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('reports zero when nothing is due yet', async () => {
    partnersRepositoryMock.selectPendingCommissionsDueSystem.mockResolvedValue([]);
    const result = await runCommissionQualificationDispatch();
    expect(result).toEqual({ approved: 0 });
    expect(partnersRepositoryMock.updateCommissionStatusSystem).not.toHaveBeenCalled();
  });
});

describe('markCommissionsPayable — the manual finance-review checkpoint', () => {
  it('moves an approved commission to payable', async () => {
    partnersRepositoryMock.selectCommissionById.mockResolvedValue({ id: 'commission-1', status: 'approved' });
    await markCommissionsPayable(['commission-1']);
    expect(partnersRepositoryMock.updateCommissionStatus).toHaveBeenCalledWith(
      'commission-1',
      expect.objectContaining({ status: 'payable', marked_payable_by: 'staff-1' }),
    );
  });

  it('rejects a commission that is not currently approved (double-review guard)', async () => {
    partnersRepositoryMock.selectCommissionById.mockResolvedValue({ id: 'commission-1', status: 'payable' });
    await expect(markCommissionsPayable(['commission-1'])).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires finance or admin', async () => {
    partnersRepositoryMock.selectCommissionById.mockResolvedValue({ id: 'commission-1', status: 'approved' });
    await markCommissionsPayable(['commission-1']);
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['finance', 'admin']);
  });
});

describe('recordPayout — payable -> paid, one payout per partner', () => {
  function payableCommission(overrides: Record<string, unknown> = {}) {
    return { id: 'commission-1', partner_id: 'partner-1', status: 'payable', commission_amount: 120, ...overrides };
  }

  beforeEach(() => {
    partnersRepositoryMock.insertPayout.mockResolvedValue({
      id: 'payout-1',
      partner_id: 'partner-1',
      total_amount: 120,
      method: 'MTN MoMo',
      reference: null,
      period_start: null,
      period_end: null,
      paid_at: '2026-08-15T00:00:00Z',
    });
  });

  it('rejects a commission that is not payable (double-review guard)', async () => {
    partnersRepositoryMock.selectCommissionById.mockResolvedValue(payableCommission({ status: 'pending' }));
    await expect(
      recordPayout({ partnerId: 'partner-1', commissionIds: ['commission-1'], method: 'MTN MoMo' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(partnersRepositoryMock.insertPayout).not.toHaveBeenCalled();
  });

  it('rejects mixing commissions from a different partner into one payout', async () => {
    partnersRepositoryMock.selectCommissionById.mockResolvedValue(
      payableCommission({ partner_id: 'a-different-partner' }),
    );
    await expect(
      recordPayout({ partnerId: 'partner-1', commissionIds: ['commission-1'], method: 'MTN MoMo' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('sums the commission amounts into one payout and marks every commission paid', async () => {
    partnersRepositoryMock.selectCommissionById
      .mockResolvedValueOnce(payableCommission({ id: 'commission-1', commission_amount: 120 }))
      .mockResolvedValueOnce(payableCommission({ id: 'commission-2', commission_amount: 80 }));

    await recordPayout({
      partnerId: 'partner-1',
      commissionIds: ['commission-1', 'commission-2'],
      method: 'MTN MoMo',
    });

    expect(partnersRepositoryMock.insertPayout).toHaveBeenCalledWith(
      expect.objectContaining({ partner_id: 'partner-1', total_amount: 200, method: 'MTN MoMo' }),
    );
    expect(partnersRepositoryMock.updateCommissionStatus).toHaveBeenCalledWith(
      'commission-1',
      expect.objectContaining({ status: 'paid', payout_id: 'payout-1' }),
    );
    expect(partnersRepositoryMock.updateCommissionStatus).toHaveBeenCalledWith(
      'commission-2',
      expect.objectContaining({ status: 'paid', payout_id: 'payout-1' }),
    );
  });
});
