import { beforeEach, describe, expect, it, vi } from 'vitest';

// Knowsia Growth Partner Programme (founder-requested 2026-08-02, per
// Coding Docs/knowsia_growth_partner_programme.md). Covers the tiered
// rates that describe the programme, code redemption, and — since Knowsia
// Core Phase 6 (2026-09-20) — that every commission action this app offers
// goes through Core's doors: this app no longer accrues, qualifies, marks
// payable, pays out or redeems a commission on its own rows.

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
  selectCommissionByIdSystem: vi.fn(),
  selectRedemptionsByIdsSystem: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const coursesServiceMock = {
  getBatchByIdSystem: vi.fn(),
};
const coreCommissionsMock = {
  isCoreCommissionsConfigured: vi.fn(() => true),
  listCoreCommissions: vi.fn(),
  markPayableOnCore: vi.fn(),
  readPartnerLedger: vi.fn(),
  recordPayoutOnCore: vi.fn(),
  redeemOnCore: vi.fn(),
};

vi.mock('@/modules/partners/repository', () => partnersRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/lib/knowsia-core/commissions', () => coreCommissionsMock);

const {
  ambassadorRate,
  institutionalFlatFee,
  redeemCodeSystem,
  markCommissionsPayable,
  recordPayout,
  validateAndTotalRedeemableCommissionsSystem,
  markCommissionsRedeemedSystem,
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
  coreCommissionsMock.isCoreCommissionsConfigured.mockReturnValue(true);
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

describe('markCommissionsPayable — the finance-review checkpoint, through Core (Phase 6)', () => {
  it('asks Core to move the rows and passes the staff user as the actor', async () => {
    coreCommissionsMock.markPayableOnCore.mockResolvedValue([{ id: 'commission-1', status: 'payable' }]);
    await markCommissionsPayable(['commission-1']);
    expect(coreCommissionsMock.markPayableOnCore).toHaveBeenCalledWith(['commission-1'], 'staff-1');
    expect(partnersRepositoryMock.updateCommissionStatus).not.toHaveBeenCalled();
  });

  it("Core's refusal (a row that is not approved) surfaces as the error, never a silent no-op", async () => {
    coreCommissionsMock.markPayableOnCore.mockRejectedValue(Object.assign(new Error('only an approved commission can be marked payable'), { code: 'CONFLICT' }));
    await expect(markCommissionsPayable(['commission-1'])).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires finance or admin', async () => {
    coreCommissionsMock.markPayableOnCore.mockResolvedValue([]);
    await markCommissionsPayable(['commission-1']);
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['finance', 'admin']);
  });
});

describe('recordPayout — a hand payout recorded on Core, once (Phase 6)', () => {
  it('sends the partner, the rows and the typed method + reference to Core and reads the payout back', async () => {
    coreCommissionsMock.recordPayoutOnCore.mockResolvedValue({
      id: 'payout-1', partner_id: 'core-partner', total_minor: 20000, currency: 'GHS', method: 'manual', reference: 'MTN MoMo · TX-9',
      commission_ids: ['commission-1', 'commission-2'], status: 'paid', paid_at: '2026-09-20T09:00:00Z', created_at: '2026-09-20T09:00:00Z',
    });
    const payout = await recordPayout({ partnerId: 'partner-1', commissionIds: ['commission-1', 'commission-2'], method: 'MTN MoMo', reference: 'TX-9' });
    expect(coreCommissionsMock.recordPayoutOnCore).toHaveBeenCalledWith({
      partnerId: 'partner-1', commissionIds: ['commission-1', 'commission-2'], reference: 'MTN MoMo · TX-9', actorRef: 'staff-1',
    });
    expect(payout).toMatchObject({ id: 'payout-1', partnerId: 'partner-1', totalAmount: 200, reference: 'MTN MoMo · TX-9', paidAt: '2026-09-20T09:00:00Z' });
    expect(partnersRepositoryMock.insertPayout).not.toHaveBeenCalled();
  });

  it("Core's refusal (a row not payable, or another partner's) is the error", async () => {
    coreCommissionsMock.recordPayoutOnCore.mockRejectedValue(Object.assign(new Error('every commission in a payout must be payable and this partner\'s'), { code: 'CONFLICT' }));
    await expect(
      recordPayout({ partnerId: 'partner-1', commissionIds: ['commission-1'], method: 'MTN MoMo' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('commission credit redemption — validated against Core\'s ledger, spent through Core\'s door (Phase 6)', () => {
  function ledger(commissions: Array<Record<string, unknown>>) {
    return { partner_id: 'core-partner', totals_minor: {}, payable_balance_minor: 0, payable_ids: [], min_payout_minor: 10000, can_pay_out: false, commissions, payouts: [], statements: [] };
  }

  it('totals the chosen payable rows from the ledger in GHS', async () => {
    coreCommissionsMock.readPartnerLedger.mockResolvedValue(ledger([
      { id: 'c1', status: 'payable', amount_minor: 12000 },
      { id: 'c2', status: 'payable', amount_minor: 8050 },
      { id: 'c3', status: 'approved', amount_minor: 5000 },
    ]));
    await expect(validateAndTotalRedeemableCommissionsSystem('partner-1', ['c1', 'c2'])).resolves.toBe(200.5);
  });

  it('refuses a row that is not payable, and a row that is not in this partner\'s ledger', async () => {
    coreCommissionsMock.readPartnerLedger.mockResolvedValue(ledger([{ id: 'c1', status: 'approved', amount_minor: 12000 }]));
    await expect(validateAndTotalRedeemableCommissionsSystem('partner-1', ['c1'])).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(validateAndTotalRedeemableCommissionsSystem('partner-1', ['someone-elses'])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a ledger Core cannot serve refuses the redemption rather than guessing from local rows', async () => {
    coreCommissionsMock.readPartnerLedger.mockResolvedValue(null);
    await expect(validateAndTotalRedeemableCommissionsSystem('partner-1', ['c1'])).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(partnersRepositoryMock.selectCommissionByIdSystem).not.toHaveBeenCalled();
  });

  it('the spend goes through Core, keyed by the registration it pays', async () => {
    coreCommissionsMock.redeemOnCore.mockResolvedValue({ total_minor: 12000, payout_id: 'po-1' });
    await markCommissionsRedeemedSystem('partner-1', ['c1'], 'reg-9');
    expect(coreCommissionsMock.redeemOnCore).toHaveBeenCalledWith({ partnerId: 'partner-1', commissionIds: ['c1'], registrationId: 'reg-9' });
    expect(partnersRepositoryMock.updateCommissionStatusSystem).not.toHaveBeenCalled();
  });

  it('without Core configured (a local checkout with no key) the local rows still answer', async () => {
    coreCommissionsMock.isCoreCommissionsConfigured.mockReturnValue(false);
    partnersRepositoryMock.selectCommissionByIdSystem.mockResolvedValue({ id: 'c1', partner_id: 'partner-1', status: 'payable', commission_amount: 120 });
    await expect(validateAndTotalRedeemableCommissionsSystem('partner-1', ['c1'])).resolves.toBe(120);
    await markCommissionsRedeemedSystem('partner-1', ['c1'], 'reg-9');
    expect(partnersRepositoryMock.updateCommissionStatusSystem).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'redeemed', redeemed_against_registration_id: 'reg-9' }));
    expect(coreCommissionsMock.redeemOnCore).not.toHaveBeenCalled();
  });
});

