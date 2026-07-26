import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPin } from '@/lib/portal-auth/pin';

const corporateRepositoryMock = {
  insertCompany: vi.fn(),
  selectCompanies: vi.fn(),
  selectCompanyById: vi.fn(),
  selectCompanyByIdSystem: vi.fn(),
  selectCompanyByEmailSystem: vi.fn(),
  insertAllocation: vi.fn(),
  selectAllocationById: vi.fn(),
  selectAllocationByIdSystem: vi.fn(),
  selectAllocationsForCompany: vi.fn(),
  updateAllocation: vi.fn(),
  selectRegistrationsForAllocationSystem: vi.fn(),
  countRegistrationsForAllocationSystem: vi.fn(),
  insertCompanyAuthIfMissing: vi.fn(),
  selectCompanyAuth: vi.fn(),
  recordFailedCompanyLogin: vi.fn(),
  recordSuccessfulCompanyLogin: vi.fn(),
  updateCompanyPin: vi.fn(),
  insertCompanySession: vi.fn(),
  selectCompanySession: vi.fn(),
  revokeCompanySession: vi.fn(),
  countCompaniesSystem: vi.fn(),
  selectAllAllocationsSystem: vi.fn(),
  selectCorporateRegistrationTotalsSystem: vi.fn(),
};
const coursesServiceMock = {
  getBatchByIdSystem: vi.fn(),
  getCourseByIdSystem: vi.fn(),
  getSeatsRemaining: vi.fn(),
  adjustBatchCapacityInternal: vi.fn(),
  updateBatch: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const registrationsServiceMock = {
  createCorporateEmployeeRegistration: vi.fn(),
};

vi.mock('@/modules/corporate/repository', () => corporateRepositoryMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/registrations/service', () => registrationsServiceMock);

const {
  createCompany,
  createSeatAllocation,
  addEmployeesToAllocation,
  updateSeatAllocationStatus,
  getAllocationById,
  loginToCompanyPortal,
  requireCompanyPortalSession,
  changeCompanyPin,
  addEmployeesToOwnAllocation,
  getCorporateSummary,
} = await import('@/modules/corporate/service');

const ADMIN_STAFF = { id: 'staff-1', fullName: 'Jane Doe', role: 'admin' };

function companyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'company-1',
    name: 'Acme Ltd',
    tin: null,
    billing_contact_name: 'HR Manager',
    billing_email: 'hr@acme.com',
    billing_phone: '+233201234567',
    billing_address: null,
    notes: null,
    created_by: 'staff-1',
    created_at: '2026-07-26T00:00:00Z',
    updated_at: '2026-07-26T00:00:00Z',
    ...overrides,
  };
}

function allocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'allocation-1',
    company_id: 'company-1',
    batch_id: 'batch-1',
    seats_purchased: 10,
    price_per_seat: 800,
    status: 'active',
    status_reason: null,
    notes: null,
    created_by: 'staff-1',
    created_at: '2026-07-26T00:00:00Z',
    updated_at: '2026-07-26T00:00:00Z',
    ...overrides,
  };
}

function activeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    courseId: 'course-1',
    cohortLabel: 'AUG-2026',
    capacity: 30,
    courseFee: 1200,
    startDate: '2026-08-01',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue(ADMIN_STAFF);
  corporateRepositoryMock.selectCompanyById.mockResolvedValue(companyRow());
  corporateRepositoryMock.selectCompanyByIdSystem.mockResolvedValue(companyRow());
  coursesServiceMock.getBatchByIdSystem.mockResolvedValue(activeBatch());
  coursesServiceMock.getCourseByIdSystem.mockResolvedValue({ id: 'course-1', courseName: 'AI For Business' });
  corporateRepositoryMock.insertCompanyAuthIfMissing.mockResolvedValue(undefined);
});

describe('createCompany', () => {
  it('requires admin or finance', async () => {
    corporateRepositoryMock.insertCompany.mockResolvedValue(companyRow());
    await createCompany({
      name: 'Acme Ltd',
      billingContactName: 'HR Manager',
      billingEmail: 'hr@acme.com',
      billingPhone: '+233201234567',
    });
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'finance']);
  });
});

describe('createSeatAllocation — BR-26 capacity reservation', () => {
  const input = { companyId: 'company-1', batchId: 'batch-1', seatsPurchased: 10, pricePerSeat: 800 };

  it('rejects a purchase larger than seats remaining', async () => {
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(5);

    await expect(createSeatAllocation(input)).rejects.toMatchObject({ code: 'INSUFFICIENT_CAPACITY' });
    expect(corporateRepositoryMock.insertAllocation).not.toHaveBeenCalled();
  });

  it('reserves the full purchase immediately via adjustBatchCapacityInternal', async () => {
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(20);
    corporateRepositoryMock.insertAllocation.mockResolvedValue(allocationRow());

    await createSeatAllocation(input);

    expect(corporateRepositoryMock.insertAllocation).toHaveBeenCalled();
    expect(coursesServiceMock.adjustBatchCapacityInternal).toHaveBeenCalledWith('batch-1', -10);
  });

  it('allows a purchase on an unlimited-capacity batch (seatsRemaining null)', async () => {
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(null);
    corporateRepositoryMock.insertAllocation.mockResolvedValue(allocationRow());

    await expect(createSeatAllocation(input)).resolves.toBeDefined();
  });

  it('rejects when the batch does not exist', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(null);
    await expect(createSeatAllocation(input)).rejects.toMatchObject({ code: 'INVALID_BATCH' });
  });
});

describe('addEmployeesToAllocation', () => {
  const actor = ADMIN_STAFF;
  function row(overrides: Record<string, unknown> = {}) {
    return {
      firstName: 'Kofi',
      middleName: null,
      surname: 'Mensah',
      gender: 'Male' as const,
      email: 'kofi@acme.com',
      phone: '+233201234567',
      jobTitle: null,
      company: null,
      amountPaid: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(allocationRow({ seats_purchased: 2 }));
    corporateRepositoryMock.countRegistrationsForAllocationSystem.mockResolvedValue(0);
    registrationsServiceMock.createCorporateEmployeeRegistration.mockResolvedValue({
      status: 'created',
      registrationId: 'reg-1',
      paymentStatus: 'Unpaid',
    });
  });

  it('adds rows up to the purchased seat count and bumps capacity by 1 per fill', async () => {
    const result = await addEmployeesToAllocation('allocation-1', {
      leadSource: 'Other',
      paymentMethod: 'Bank Transfer',
      rows: [row({ email: 'a@acme.com' }), row({ email: 'b@acme.com' })],
    }, actor);

    expect(result.summary.created).toBe(2);
    expect(coursesServiceMock.adjustBatchCapacityInternal).toHaveBeenCalledTimes(2);
    expect(coursesServiceMock.adjustBatchCapacityInternal).toHaveBeenCalledWith('batch-1', 1);
    // Fill events must never go through the audited/waitlist-notifying path.
    expect(coursesServiceMock.updateBatch).not.toHaveBeenCalled();
  });

  it('rejects rows beyond the purchased seat count as seats_exhausted', async () => {
    const result = await addEmployeesToAllocation('allocation-1', {
      leadSource: 'Other',
      paymentMethod: 'Bank Transfer',
      rows: [row({ email: 'a@acme.com' }), row({ email: 'b@acme.com' }), row({ email: 'c@acme.com' })],
    }, actor);

    expect(result.summary.created).toBe(2);
    expect(result.results[2]).toMatchObject({ status: 'seats_exhausted', email: 'c@acme.com' });
    expect(registrationsServiceMock.createCorporateEmployeeRegistration).toHaveBeenCalledTimes(2);
  });

  it('rejects adding to a non-active allocation', async () => {
    corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(allocationRow({ status: 'cancelled' }));
    await expect(
      addEmployeesToAllocation('allocation-1', { leadSource: 'Other', paymentMethod: 'Bank Transfer', rows: [row()] }, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('records duplicate rows without incrementing capacity', async () => {
    registrationsServiceMock.createCorporateEmployeeRegistration.mockResolvedValue({ status: 'duplicate' });
    const result = await addEmployeesToAllocation('allocation-1', {
      leadSource: 'Other',
      paymentMethod: 'Bank Transfer',
      rows: [row()],
    }, actor);
    expect(result.summary.duplicates).toBe(1);
    expect(coursesServiceMock.adjustBatchCapacityInternal).not.toHaveBeenCalled();
  });
});

describe('updateSeatAllocationStatus — BR-30 cancellation releases unfilled seats', () => {
  it('releases only the unfilled portion via the full (waitlist-notifying) updateBatch', async () => {
    corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(allocationRow({ seats_purchased: 10 }));
    corporateRepositoryMock.countRegistrationsForAllocationSystem.mockResolvedValue(6);
    corporateRepositoryMock.updateAllocation.mockResolvedValue(allocationRow({ status: 'cancelled' }));

    await updateSeatAllocationStatus('allocation-1', { status: 'cancelled', reason: 'Company downsized' });

    expect(coursesServiceMock.updateBatch).toHaveBeenCalledWith('batch-1', { capacity: 34 }); // 30 + (10-6)
    expect(coursesServiceMock.adjustBatchCapacityInternal).not.toHaveBeenCalled();
  });

  it('does not touch capacity when the allocation was fully filled', async () => {
    corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(allocationRow({ seats_purchased: 10 }));
    corporateRepositoryMock.countRegistrationsForAllocationSystem.mockResolvedValue(10);
    corporateRepositoryMock.updateAllocation.mockResolvedValue(allocationRow({ status: 'cancelled' }));

    await updateSeatAllocationStatus('allocation-1', { status: 'cancelled', reason: 'Fully used already' });

    expect(coursesServiceMock.updateBatch).not.toHaveBeenCalled();
  });

  it('rejects closing an already-closed allocation', async () => {
    corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(allocationRow({ status: 'completed' }));
    await expect(
      updateSeatAllocationStatus('allocation-1', { status: 'cancelled', reason: 'test' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('company portal auth — mirrors modules/portal/service.ts, scoped to company_id', () => {
  function companyAuthRow(overrides: Record<string, unknown> = {}) {
    return {
      company_id: 'company-1',
      pin_hash: hashPin('1234'),
      must_change_pin: false,
      failed_attempts: 0,
      locked_until: null,
      last_login_at: null,
      ...overrides,
    };
  }

  describe('loginToCompanyPortal', () => {
    it('returns invalid for an unknown billing email (no enumeration)', async () => {
      corporateRepositoryMock.selectCompanyByEmailSystem.mockResolvedValue(null);
      const result = await loginToCompanyPortal({ billingEmail: 'nobody@x.com', pin: '1234' });
      expect(result).toEqual({ status: 'invalid' });
    });

    it('logs in with the correct PIN and mints a session', async () => {
      corporateRepositoryMock.selectCompanyByEmailSystem.mockResolvedValue(companyRow());
      corporateRepositoryMock.selectCompanyAuth.mockResolvedValue(companyAuthRow());
      corporateRepositoryMock.insertCompanySession.mockResolvedValue({
        id: 'session-1',
        company_id: 'company-1',
        expires_at: '2099-01-01T00:00:00Z',
      });

      const result = await loginToCompanyPortal({ billingEmail: 'hr@acme.com', pin: '1234' });

      expect(result).toMatchObject({ status: 'ok', sessionId: 'session-1' });
      expect(corporateRepositoryMock.recordSuccessfulCompanyLogin).toHaveBeenCalledWith('company-1');
    });

    it('rejects the wrong PIN and increments failed_attempts', async () => {
      corporateRepositoryMock.selectCompanyByEmailSystem.mockResolvedValue(companyRow());
      corporateRepositoryMock.selectCompanyAuth.mockResolvedValue(companyAuthRow());

      const result = await loginToCompanyPortal({ billingEmail: 'hr@acme.com', pin: '0000' });

      expect(result).toEqual({ status: 'invalid' });
      expect(corporateRepositoryMock.recordFailedCompanyLogin).toHaveBeenCalledWith('company-1', {
        failed_attempts: 1,
        locked_until: null,
      });
    });

    it('locks after 5 failed attempts', async () => {
      corporateRepositoryMock.selectCompanyByEmailSystem.mockResolvedValue(companyRow());
      corporateRepositoryMock.selectCompanyAuth.mockResolvedValue(companyAuthRow({ failed_attempts: 4 }));

      const result = await loginToCompanyPortal({ billingEmail: 'hr@acme.com', pin: '0000' });

      expect(result).toEqual({ status: 'locked' });
      expect(corporateRepositoryMock.recordFailedCompanyLogin).toHaveBeenCalledWith(
        'company-1',
        expect.objectContaining({ failed_attempts: 0 }),
      );
    });

    it('rejects while already locked out, without re-checking the PIN', async () => {
      corporateRepositoryMock.selectCompanyByEmailSystem.mockResolvedValue(companyRow());
      corporateRepositoryMock.selectCompanyAuth.mockResolvedValue(
        companyAuthRow({ locked_until: '2099-01-01T00:00:00Z' }),
      );

      const result = await loginToCompanyPortal({ billingEmail: 'hr@acme.com', pin: '1234' });

      expect(result).toEqual({ status: 'locked' });
      expect(corporateRepositoryMock.recordFailedCompanyLogin).not.toHaveBeenCalled();
    });
  });

  describe('requireCompanyPortalSession (BR-29)', () => {
    it('throws UNAUTHENTICATED with no session id', async () => {
      await expect(requireCompanyPortalSession(undefined)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('throws UNAUTHENTICATED for an expired session', async () => {
      corporateRepositoryMock.selectCompanySession.mockResolvedValue({
        id: 'session-1',
        company_id: 'company-1',
        expires_at: '2020-01-01T00:00:00Z',
        revoked_at: null,
      });
      await expect(requireCompanyPortalSession('session-1')).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('returns the scoped companyId for a valid session', async () => {
      corporateRepositoryMock.selectCompanySession.mockResolvedValue({
        id: 'session-1',
        company_id: 'company-1',
        expires_at: '2099-01-01T00:00:00Z',
        revoked_at: null,
      });
      await expect(requireCompanyPortalSession('session-1')).resolves.toEqual({ companyId: 'company-1' });
    });
  });

  describe('changeCompanyPin', () => {
    it('rejects the wrong current PIN', async () => {
      corporateRepositoryMock.selectCompanySession.mockResolvedValue({
        id: 'session-1',
        company_id: 'company-1',
        expires_at: '2099-01-01T00:00:00Z',
        revoked_at: null,
      });
      corporateRepositoryMock.selectCompanyAuth.mockResolvedValue(companyAuthRow());

      await expect(
        changeCompanyPin('session-1', { currentPin: '0000', newPin: '5678' }),
      ).rejects.toMatchObject({ code: 'INVALID_PIN' });
      expect(corporateRepositoryMock.updateCompanyPin).not.toHaveBeenCalled();
    });
  });

  describe('addEmployeesToOwnAllocation — BR-29 scoping + BR-12 payment safety', () => {
    it('rejects an allocation belonging to a different company', async () => {
      corporateRepositoryMock.selectCompanySession.mockResolvedValue({
        id: 'session-1',
        company_id: 'company-1',
        expires_at: '2099-01-01T00:00:00Z',
        revoked_at: null,
      });
      corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(
        allocationRow({ company_id: 'company-OTHER' }),
      );

      await expect(
        addEmployeesToOwnAllocation('session-1', 'allocation-1', {
          leadSource: 'Other',
          paymentMethod: 'Bank Transfer',
          rows: [],
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('forces every row amountPaid to 0 regardless of what was submitted', async () => {
      corporateRepositoryMock.selectCompanySession.mockResolvedValue({
        id: 'session-1',
        company_id: 'company-1',
        expires_at: '2099-01-01T00:00:00Z',
        revoked_at: null,
      });
      corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(
        allocationRow({ company_id: 'company-1', seats_purchased: 5 }),
      );
      corporateRepositoryMock.countRegistrationsForAllocationSystem.mockResolvedValue(0);
      registrationsServiceMock.createCorporateEmployeeRegistration.mockResolvedValue({
        status: 'created',
        registrationId: 'reg-1',
        paymentStatus: 'Unpaid',
      });

      await addEmployeesToOwnAllocation('session-1', 'allocation-1', {
        leadSource: 'Other',
        paymentMethod: 'Bank Transfer',
        rows: [
          {
            firstName: 'Kofi',
            middleName: null,
            surname: 'Mensah',
            gender: 'Male',
            email: 'kofi@acme.com',
            phone: '+233201234567',
            jobTitle: null,
            company: null,
            amountPaid: 5000, // attempted — must be stripped
          },
        ],
      });

      expect(registrationsServiceMock.createCorporateEmployeeRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaid: 0 }),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});

describe('getAllocationById — rolled-up view', () => {
  it('computes seatsUsed/seatsRemaining/amountInvoiced/amountSettled from the live roster, never stored', async () => {
    corporateRepositoryMock.selectAllocationByIdSystem.mockResolvedValue(allocationRow({ seats_purchased: 5 }));
    corporateRepositoryMock.selectRegistrationsForAllocationSystem.mockResolvedValue([
      {
        registration: { id: 'reg-1', registered_at: '2026-07-26T00:00:00Z' },
        participant: { full_name: 'Kofi Mensah', email: 'kofi@acme.com', phone: '+233201234567' },
        payment: { course_fee: 800, amount_paid: 800, payment_status: 'Paid' },
      },
      {
        registration: { id: 'reg-2', registered_at: '2026-07-26T00:00:00Z' },
        participant: { full_name: 'Ama Owusu', email: 'ama@acme.com', phone: '+233201234568' },
        payment: { course_fee: 800, amount_paid: 0, payment_status: 'Unpaid' },
      },
    ]);

    const detail = await getAllocationById('allocation-1');

    expect(detail.seatsUsed).toBe(2);
    expect(detail.seatsRemaining).toBe(3);
    expect(detail.amountInvoiced).toBe(1600);
    expect(detail.amountSettled).toBe(800);
  });
});

describe('getCorporateSummary — Phase 3 dashboard aggregate (computed live, never stored)', () => {
  it('aggregates seats sold/filled and invoiced/settled totals across every company', async () => {
    corporateRepositoryMock.countCompaniesSystem.mockResolvedValue(2);
    corporateRepositoryMock.selectAllAllocationsSystem.mockResolvedValue([
      allocationRow({ id: 'a1', seats_purchased: 10 }),
      allocationRow({ id: 'a2', seats_purchased: 20 }),
    ]);
    corporateRepositoryMock.selectCorporateRegistrationTotalsSystem.mockResolvedValue([
      { companyAllocationId: 'a1', courseFee: 800, amountPaid: 800 },
      { companyAllocationId: 'a1', courseFee: 800, amountPaid: 0 },
      { companyAllocationId: 'a2', courseFee: 1200, amountPaid: 600 },
    ]);

    const summary = await getCorporateSummary();

    expect(summary).toEqual({
      totalCompanies: 2,
      seatsSold: 30,
      seatsFilled: 3,
      amountInvoiced: 2800,
      amountSettled: 1400,
    });
  });
});
