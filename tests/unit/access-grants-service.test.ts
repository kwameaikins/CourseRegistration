import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectLiveGrantsForRegistrationsSystem: vi.fn(),
  selectGrantHistoryForRegistrationSystem: vi.fn(),
  selectUnrevokedGrantsSystem: vi.fn(),
  insertGrantSystem: vi.fn(),
  revokeLiveGrantsSystem: vi.fn(),
  confirmRegistrationSystem: vi.fn(),
  unconfirmRegistrationSystem: vi.fn(),
  selectPaymentContextSystem: vi.fn(),
  selectSettledRegistrationIdsSystem: vi.fn(),
  selectZoomRegistrantForRevocationSystem: vi.fn(),
  selectGrantHistoryForRegistration: vi.fn(),
  selectStaffNamesByIds: vi.fn(),
};
const usersServiceMock = { requireRole: vi.fn() };
const emailEngineMock = { sendEmailOnce: vi.fn() };
const attendanceServiceMock = { ensureZoomRegistration: vi.fn() };
const attendanceRepositoryMock = { deleteZoomRegistrantByRegistration: vi.fn() };
const zoomClientMock = { isZoomConfigured: vi.fn(), denyMeetingRegistrant: vi.fn() };
const agentToolsRepositoryMock = { insertStaffActionAuditLog: vi.fn() };

vi.mock('@/modules/access-grants/repository', () => repositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/communications/email-engine', () => emailEngineMock);
vi.mock('@/modules/attendance/service', () => attendanceServiceMock);
vi.mock('@/modules/attendance/repository', () => attendanceRepositoryMock);
vi.mock('@/lib/zoom/client', () => zoomClientMock);
vi.mock('@/modules/agent-tools/repository', () => agentToolsRepositoryMock);

const {
  addDaysIso,
  autoGrantOnPartPaymentSystem,
  daysBetweenIso,
  getAccessStatesSystem,
  grantAccessAsStaff,
  isGrantActiveOn,
  resolveAccessState,
  runAccessSweep,
} = await import('@/modules/access-grants/service');

const FINANCE = { id: 'staff-1', fullName: 'Akosua Mensah', role: 'finance' };
const ADMIN = { id: 'staff-2', fullName: 'Kwame Boateng', role: 'admin' };

function grantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grant-1',
    registration_id: 'reg-1',
    reason: 'part_payment',
    expires_on: '2026-08-13',
    note: 'Paid half',
    granted_by: null,
    granted_at: '2026-08-08T10:00:00Z',
    revoked_by: null,
    revoked_at: null,
    created_at: '2026-08-08T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue(FINANCE);
  emailEngineMock.sendEmailOnce.mockResolvedValue('sent');
  attendanceServiceMock.ensureZoomRegistration.mockResolvedValue('registered');
  attendanceRepositoryMock.deleteZoomRegistrantByRegistration.mockResolvedValue(undefined);
  zoomClientMock.isZoomConfigured.mockReturnValue(false);
  agentToolsRepositoryMock.insertStaffActionAuditLog.mockResolvedValue(undefined);
  repositoryMock.selectLiveGrantsForRegistrationsSystem.mockResolvedValue([]);
  repositoryMock.selectGrantHistoryForRegistrationSystem.mockResolvedValue([]);
  repositoryMock.selectSettledRegistrationIdsSystem.mockResolvedValue(new Set());
  repositoryMock.insertGrantSystem.mockResolvedValue(grantRow());
  repositoryMock.confirmRegistrationSystem.mockResolvedValue(undefined);
  repositoryMock.unconfirmRegistrationSystem.mockResolvedValue(undefined);
  repositoryMock.revokeLiveGrantsSystem.mockResolvedValue(1);
  repositoryMock.selectZoomRegistrantForRevocationSystem.mockResolvedValue(null);
  repositoryMock.selectPaymentContextSystem.mockResolvedValue({
    paymentStatus: 'Part Payment',
    courseFee: 1200,
    amountPaid: 600,
    balance: 600,
    batchIsFree: false,
  });
});

describe('date helpers', () => {
  it('treats expires_on as the inclusive last day', () => {
    expect(isGrantActiveOn('2026-08-13', '2026-08-13')).toBe(true);
    expect(isGrantActiveOn('2026-08-13', '2026-08-14')).toBe(false);
  });

  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-08-29', 5)).toBe('2026-09-03');
  });

  it('counts whole days between two dates', () => {
    expect(daysBetweenIso('2026-08-08', '2026-08-13')).toBe(5);
  });
});

describe('resolveAccessState', () => {
  it('gives permanent access to a settled balance, with no expiry', () => {
    expect(resolveAccessState(true, [], '2026-08-10')).toEqual({
      hasAccess: true,
      until: null,
      reason: null,
    });
  });

  it('takes the latest live grant when several exist (an extension wins)', () => {
    const state = resolveAccessState(
      false,
      [
        { expiresOn: '2026-08-10', reason: 'part_payment' },
        { expiresOn: '2026-08-20', reason: 'credit' },
      ],
      '2026-08-12',
    );
    expect(state).toEqual({ hasAccess: true, until: '2026-08-20', reason: 'credit' });
  });

  it('denies access once every grant has lapsed', () => {
    const state = resolveAccessState(
      false,
      [{ expiresOn: '2026-08-10', reason: 'part_payment' }],
      '2026-08-11',
    );
    expect(state).toEqual({ hasAccess: false, until: null, reason: null });
  });
});

describe('getAccessStatesSystem', () => {
  it('resolves a whole batch of registrations in one pair of queries', async () => {
    repositoryMock.selectSettledRegistrationIdsSystem.mockResolvedValue(new Set(['reg-paid']));
    repositoryMock.selectLiveGrantsForRegistrationsSystem.mockResolvedValue([
      grantRow({ registration_id: 'reg-granted', expires_on: '2026-08-20' }),
    ]);

    const states = await getAccessStatesSystem(
      ['reg-paid', 'reg-granted', 'reg-nothing'],
      new Date('2026-08-12T09:00:00Z'),
    );

    expect(states.get('reg-paid')?.hasAccess).toBe(true);
    expect(states.get('reg-granted')).toEqual({
      hasAccess: true,
      until: '2026-08-20',
      reason: 'part_payment',
    });
    expect(states.get('reg-nothing')?.hasAccess).toBe(false);
    expect(repositoryMock.selectLiveGrantsForRegistrationsSystem).toHaveBeenCalledTimes(1);
  });
});

describe('autoGrantOnPartPaymentSystem', () => {
  it('grants 5 days once half the fee is in', async () => {
    const grant = await autoGrantOnPartPaymentSystem('reg-1', new Date('2026-08-08T09:00:00Z'));

    expect(grant).not.toBeNull();
    expect(repositoryMock.insertGrantSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_id: 'reg-1',
        reason: 'part_payment',
        expires_on: '2026-08-13',
        granted_by: null,
      }),
    );
    // The seat is confirmed so the tutor roster and class reminders see them.
    expect(repositoryMock.confirmRegistrationSystem).toHaveBeenCalledWith('reg-1');
    // Joining details, but never a receipt for money that has not arrived.
    expect(attendanceServiceMock.ensureZoomRegistration).toHaveBeenCalledWith('reg-1');
    const sentTypes = emailEngineMock.sendEmailOnce.mock.calls.map((call) => call[1]);
    expect(sentTypes).toContain('access_granted');
    expect(sentTypes).not.toContain('payment_confirmation');
  });

  // Ordering matters: selectRegistrationEmailContext resolves {{zoom_link}}
  // to the personal join URL only once a zoom_registrants row exists, so
  // registering has to happen before any joining-details email goes out.
  it('registers with Zoom before sending the joining details', async () => {
    const order: string[] = [];
    attendanceServiceMock.ensureZoomRegistration.mockImplementation(async () => {
      order.push('zoom');
      return 'registered';
    });
    emailEngineMock.sendEmailOnce.mockImplementation(async (_id: string, type: string) => {
      order.push(`email:${type}`);
      return 'sent';
    });

    await autoGrantOnPartPaymentSystem('reg-1', new Date('2026-08-08T09:00:00Z'));

    expect(order[0]).toBe('zoom');
    expect(order).toContain('email:access_granted');
  });

  it('does nothing below the threshold', async () => {
    repositoryMock.selectPaymentContextSystem.mockResolvedValue({
      paymentStatus: 'Part Payment',
      courseFee: 1200,
      amountPaid: 100,
      balance: 1100,
      batchIsFree: false,
    });
    expect(await autoGrantOnPartPaymentSystem('reg-1')).toBeNull();
    expect(repositoryMock.insertGrantSystem).not.toHaveBeenCalled();
  });

  // The rule that stops someone keeping access alive forever by dripping in
  // small top-ups: the automatic grant fires once per registration, ever.
  it('never fires twice, even after a staff revocation', async () => {
    repositoryMock.selectGrantHistoryForRegistrationSystem.mockResolvedValue([
      grantRow({ revoked_at: '2026-08-09T10:00:00Z' }),
    ]);
    expect(await autoGrantOnPartPaymentSystem('reg-1')).toBeNull();
    expect(repositoryMock.insertGrantSystem).not.toHaveBeenCalled();
  });

  it('ignores free events and settled balances', async () => {
    repositoryMock.selectPaymentContextSystem.mockResolvedValue({
      paymentStatus: 'Paid',
      courseFee: 0,
      amountPaid: 0,
      balance: 0,
      batchIsFree: true,
    });
    expect(await autoGrantOnPartPaymentSystem('reg-1')).toBeNull();
  });
});

describe('grantAccessAsStaff', () => {
  it('defaults to a 5-day window and records the staff actor', async () => {
    await grantAccessAsStaff(
      'reg-1',
      { reason: 'credit', note: 'Employer settling next week' },
      new Date('2026-08-08T09:00:00Z'),
    );

    expect(repositoryMock.insertGrantSystem).toHaveBeenCalledWith(
      expect.objectContaining({ expires_on: '2026-08-13', granted_by: 'staff-1' }),
    );
    expect(agentToolsRepositoryMock.insertStaffActionAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: 'grant_course_access' }),
    );
  });

  it('refuses when the balance is already settled', async () => {
    repositoryMock.selectPaymentContextSystem.mockResolvedValue({
      paymentStatus: 'Paid',
      courseFee: 1200,
      amountPaid: 1200,
      balance: 0,
      batchIsFree: false,
    });
    await expect(
      grantAccessAsStaff('reg-1', { reason: 'credit', note: 'Not needed' }),
    ).rejects.toThrow(/already settled/i);
  });

  // Finance's ceiling is cumulative from the FIRST grant, so a chain of short
  // extensions cannot quietly become open-ended credit.
  it('stops finance past the 21-day cumulative ceiling', async () => {
    repositoryMock.selectLiveGrantsForRegistrationsSystem.mockResolvedValue([
      grantRow({ granted_at: '2026-08-01T10:00:00Z', expires_on: '2026-08-20' }),
    ]);
    await expect(
      grantAccessAsStaff(
        'reg-1',
        { reason: 'credit', days: 10, note: 'One more week' },
        new Date('2026-08-18T09:00:00Z'),
      ),
    ).rejects.toThrow(/admin/i);
    expect(repositoryMock.insertGrantSystem).not.toHaveBeenCalled();
  });

  it('lets an admin past that ceiling', async () => {
    usersServiceMock.requireRole.mockResolvedValue(ADMIN);
    repositoryMock.selectLiveGrantsForRegistrationsSystem.mockResolvedValue([
      grantRow({ granted_at: '2026-08-01T10:00:00Z', expires_on: '2026-08-20' }),
    ]);
    await grantAccessAsStaff(
      'reg-1',
      { reason: 'credit', days: 10, note: 'Founder approved' },
      new Date('2026-08-18T09:00:00Z'),
    );
    expect(repositoryMock.insertGrantSystem).toHaveBeenCalledWith(
      expect.objectContaining({ expires_on: '2026-08-28' }),
    );
    // An extension is logged as such, not as a fresh grant.
    expect(agentToolsRepositoryMock.insertStaffActionAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: 'extend_course_access' }),
    );
  });

  it('rejects an end date already in the past', async () => {
    await expect(
      grantAccessAsStaff(
        'reg-1',
        { reason: 'credit', expiresOn: '2026-08-01', note: 'Backdated' },
        new Date('2026-08-08T09:00:00Z'),
      ),
    ).rejects.toThrow(/in the past/i);
  });
});

describe('runAccessSweep', () => {
  it('withdraws the seat and revokes the Zoom link once a grant has lapsed', async () => {
    zoomClientMock.isZoomConfigured.mockReturnValue(true);
    repositoryMock.selectZoomRegistrantForRevocationSystem.mockResolvedValue({
      zoom_registrant_id: 'zr-1',
      meeting_id: '99887766',
      email: 'ama@example.com',
    });
    repositoryMock.selectUnrevokedGrantsSystem.mockResolvedValue([
      grantRow({ expires_on: '2026-08-10' }),
    ]);

    const summary = await runAccessSweep(new Date('2026-08-12T07:00:00Z'));

    expect(summary.accessWithdrawn).toBe(1);
    expect(summary.zoomRevoked).toBe(1);
    expect(repositoryMock.unconfirmRegistrationSystem).toHaveBeenCalledWith('reg-1');
    expect(zoomClientMock.denyMeetingRegistrant).toHaveBeenCalledWith({
      meetingId: '99887766',
      registrantId: 'zr-1',
      email: 'ama@example.com',
    });
    expect(emailEngineMock.sendEmailOnce).toHaveBeenCalledWith(
      'reg-1',
      'access_expired',
      expect.anything(),
    );
  });

  // An extension is a new row; the old, already-lapsed row must not trigger a
  // sweep against someone whose access is currently live.
  it('uses the latest grant, so an extension protects an older lapsed row', async () => {
    repositoryMock.selectUnrevokedGrantsSystem.mockResolvedValue([
      grantRow({ id: 'grant-1', expires_on: '2026-08-10' }),
      grantRow({ id: 'grant-2', expires_on: '2026-08-20' }),
    ]);

    const summary = await runAccessSweep(new Date('2026-08-12T07:00:00Z'));

    expect(summary.accessWithdrawn).toBe(0);
    expect(repositoryMock.unconfirmRegistrationSystem).not.toHaveBeenCalled();
  });

  it('warns ahead of an expiry that is still a few days out', async () => {
    repositoryMock.selectUnrevokedGrantsSystem.mockResolvedValue([
      grantRow({ expires_on: '2026-08-14' }),
    ]);

    const summary = await runAccessSweep(new Date('2026-08-12T07:00:00Z'));

    expect(summary.warningsSent).toBe(1);
    expect(emailEngineMock.sendEmailOnce).toHaveBeenCalledWith(
      'reg-1',
      'access_expiring',
      expect.anything(),
    );
    expect(repositoryMock.unconfirmRegistrationSystem).not.toHaveBeenCalled();
  });

  // Someone who settled up between the grant and the sweep keeps everything
  // on their own merit — the seat must not be walked back under them.
  it('leaves a registration alone if the balance was settled meanwhile', async () => {
    repositoryMock.selectSettledRegistrationIdsSystem.mockResolvedValue(new Set(['reg-1']));
    repositoryMock.selectUnrevokedGrantsSystem.mockResolvedValue([
      grantRow({ expires_on: '2026-08-10' }),
    ]);

    await runAccessSweep(new Date('2026-08-12T07:00:00Z'));

    expect(repositoryMock.unconfirmRegistrationSystem).not.toHaveBeenCalled();
    expect(zoomClientMock.denyMeetingRegistrant).not.toHaveBeenCalled();
  });

  it('keeps going when one registration throws', async () => {
    repositoryMock.selectUnrevokedGrantsSystem.mockResolvedValue([
      grantRow({ registration_id: 'reg-bad', expires_on: '2026-08-10' }),
      grantRow({ registration_id: 'reg-good', expires_on: '2026-08-10' }),
    ]);
    repositoryMock.selectSettledRegistrationIdsSystem.mockImplementation(
      async (ids: string[]) => {
        if (ids[0] === 'reg-bad') throw new Error('db blip');
        return new Set<string>();
      },
    );

    const summary = await runAccessSweep(new Date('2026-08-12T07:00:00Z'));

    expect(summary.errors).toHaveLength(1);
    expect(summary.accessWithdrawn).toBe(1);
  });
});
