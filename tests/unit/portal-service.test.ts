import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectParticipantByIdentifier: vi.fn(),
  selectParticipantAuth: vi.fn(),
  insertParticipantAuthIfMissing: vi.fn(),
  recordFailedLogin: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
  updateParticipantPin: vi.fn(),
  insertSession: vi.fn(),
  selectSession: vi.fn(),
  revokeSession: vi.fn(),
  selectAllActiveParticipants: vi.fn(),
  selectPortalDashboardData: vi.fn(),
  updateParticipantName: vi.fn(),
  selectRegistrationIdsForParticipant: vi.fn(),
  selectParticipantIdForRegistration: vi.fn(),
  insertLoginToken: vi.fn(),
  consumeLoginToken: vi.fn(),
  insertPinResetToken: vi.fn(),
  consumePinResetToken: vi.fn(),
  clearLockout: vi.fn(),
};
const paymentsRepositoryMock = {
  selectPaymentSummaryByTransactionIdSystem: vi.fn(),
};
const certificatesServiceMock = {
  renameExistingCertificates: vi.fn(),
};
const coursesServiceMock = {
  getActiveBatchesForPublicForm: vi.fn(),
};
const resendClientMock = {
  sendTransactionalEmail: vi.fn(),
};
const feedbackServiceMock = {
  submitFeedback: vi.fn(),
};
// Access gate (2026-08-08). The dashboard no longer reads payment_status
// directly for link visibility — access-grants decides, from a settled
// balance OR a live time-boxed grant. The default implementation in the
// global beforeEach mirrors "settled balance", so every pre-existing
// assertion below keeps testing exactly what it always did.
const accessGrantsServiceMock = {
  getAccessStatesSystem: vi.fn(),
};

vi.mock('@/modules/access-grants/service', () => accessGrantsServiceMock);
vi.mock('@/modules/portal/repository', () => repositoryMock);
vi.mock('@/modules/payments/repository', () => paymentsRepositoryMock);
vi.mock('@/modules/certificates/service', () => certificatesServiceMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/modules/feedback/service', () => feedbackServiceMock);
vi.mock('@/lib/resend/client', () => resendClientMock);

const {
  login,
  changePin,
  ensureParticipantAuth,
  backfillParticipantAuth,
  requirePortalSession,
  getPortalDashboard,
  issuePortalLoginToken,
  exchangeLoginToken,
  updateName,
  getReceiptData,
  getReceiptDataForStaff,
  getStudentStatusForStaff,
  getOtherCourses,
  hasCourseEnded,
  requestPinReset,
  resetPin,
  submitPortalFeedback,
} = await import('@/modules/portal/service');
const { hashPin } = await import('@/lib/portal-auth/pin');

const PARTICIPANT = {
  id: 'participant-1',
  full_name: 'Ama Owusu',
  email: 'ama@example.com',
  phone: '0245121941',
  deleted_at: null,
};

function authRow(overrides: Record<string, unknown> = {}) {
  return {
    participant_id: 'participant-1',
    pin_hash: hashPin('1941'),
    must_change_pin: true,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mirrors the real rule for the settled-balance half of the gate: a Paid
  // registration has permanent access. Tests covering the grant half
  // override this.
  accessGrantsServiceMock.getAccessStatesSystem.mockImplementation(
    async (registrationIds: string[]) => {
      const data = (await repositoryMock.selectPortalDashboardData()) as {
        registrations?: Array<{
          registration: { id: string };
          payment?: { payment_status?: string } | null;
        }>;
      } | null;
      return new Map(
        registrationIds.map((id) => {
          const row = data?.registrations?.find((entry) => entry.registration.id === id);
          return [
            id,
            {
              hasAccess: row?.payment?.payment_status === 'Paid',
              until: null,
              reason: null,
            },
          ];
        }),
      );
    },
  );
  repositoryMock.selectParticipantByIdentifier.mockResolvedValue(PARTICIPANT);
  repositoryMock.selectParticipantAuth.mockResolvedValue(authRow());
  repositoryMock.selectRegistrationIdsForParticipant.mockResolvedValue(['reg-1', 'reg-2']);
  certificatesServiceMock.renameExistingCertificates.mockResolvedValue(undefined);
  repositoryMock.insertSession.mockResolvedValue({
    id: 'session-1',
    participant_id: 'participant-1',
  });
  repositoryMock.selectSession.mockResolvedValue({
    id: 'session-1',
    participant_id: 'participant-1',
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
});

describe('login', () => {
  it('succeeds with the correct PIN and returns mustChangePin from the auth row', async () => {
    const result = await login({ identifier: 'ama@example.com', pin: '1941' });
    expect(result).toMatchObject({ status: 'ok', sessionId: 'session-1', mustChangePin: true });
    expect(repositoryMock.recordSuccessfulLogin).toHaveBeenCalledWith('participant-1');
  });

  it('returns the same generic "invalid" status for an unknown identifier as a wrong PIN (no enumeration)', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(null);
    const unknownResult = await login({ identifier: 'nobody@example.com', pin: '1941' });

    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(PARTICIPANT);
    const wrongPinResult = await login({ identifier: 'ama@example.com', pin: '0000' });

    expect(unknownResult.status).toBe('invalid');
    expect(wrongPinResult.status).toBe('invalid');
  });

  it('never calls recordFailedLogin for an unknown identifier (nothing to update)', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(null);
    await login({ identifier: 'nobody@example.com', pin: '1941' });
    expect(repositoryMock.recordFailedLogin).not.toHaveBeenCalled();
  });

  it('self-heals a missing portal auth row from the participant phone', async () => {
    repositoryMock.selectParticipantAuth
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(authRow());

    const result = await login({ identifier: '0245121941', pin: '1941' });

    expect(repositoryMock.insertParticipantAuthIfMissing).toHaveBeenCalledWith(
      'participant-1',
      expect.any(String),
    );
    expect(result).toMatchObject({ status: 'ok', sessionId: 'session-1' });
  });

  it('increments failed_attempts on a wrong PIN without locking below the threshold', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(authRow({ failed_attempts: 2 }));
    const result = await login({ identifier: 'ama@example.com', pin: '0000' });

    expect(result.status).toBe('invalid');
    expect(repositoryMock.recordFailedLogin).toHaveBeenCalledWith('participant-1', {
      failed_attempts: 3,
      locked_until: null,
    });
  });

  it('locks the account on the 5th consecutive failed attempt', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(authRow({ failed_attempts: 4 }));
    const result = await login({ identifier: 'ama@example.com', pin: '0000' });

    expect(result.status).toBe('locked');
    const call = repositoryMock.recordFailedLogin.mock.calls[0][1];
    expect(call.failed_attempts).toBe(0);
    expect(new Date(call.locked_until).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects immediately (no PIN check) while locked_until is in the future', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(
      authRow({ locked_until: new Date(Date.now() + 60_000).toISOString() }),
    );
    const result = await login({ identifier: 'ama@example.com', pin: '1941' });

    expect(result.status).toBe('locked');
    expect(repositoryMock.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it('allows login again once locked_until has passed', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(
      authRow({ locked_until: new Date(Date.now() - 60_000).toISOString() }),
    );
    const result = await login({ identifier: 'ama@example.com', pin: '1941' });
    expect(result.status).toBe('ok');
  });
});

describe('changePin', () => {
  it('rejects when the current PIN is wrong', async () => {
    await expect(
      changePin('session-1', { currentPin: '0000', newPin: '1234' }),
    ).rejects.toMatchObject({ code: 'INVALID_PIN' });
    expect(repositoryMock.updateParticipantPin).not.toHaveBeenCalled();
  });

  it('updates the PIN when the current PIN is correct', async () => {
    repositoryMock.selectSession.mockResolvedValue({
      id: 'session-1',
      participant_id: 'participant-1',
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await changePin('session-1', { currentPin: '1941', newPin: '1234' });
    expect(repositoryMock.updateParticipantPin).toHaveBeenCalledWith(
      'participant-1',
      expect.any(String),
    );
  });
});

describe('updateName', () => {
  it('joins first/middle/surname into full_name and writes it via the repository', async () => {
    await updateName('session-1', {
      firstName: 'Ama',
      middleName: null,
      surname: 'Owusu-Mensah',
    });
    expect(repositoryMock.updateParticipantName).toHaveBeenCalledWith('participant-1', {
      first_name: 'Ama',
      middle_name: null,
      surname: 'Owusu-Mensah',
      full_name: 'Ama Owusu-Mensah',
    });
  });

  it('includes the middle name in full_name when present', async () => {
    await updateName('session-1', {
      firstName: 'Ama',
      middleName: 'Adjoa',
      surname: 'Owusu',
    });
    expect(repositoryMock.updateParticipantName).toHaveBeenCalledWith('participant-1', {
      first_name: 'Ama',
      middle_name: 'Adjoa',
      surname: 'Owusu',
      full_name: 'Ama Adjoa Owusu',
    });
  });

  it('rejects without a valid session', async () => {
    await expect(
      updateName(undefined, { firstName: 'Ama', middleName: null, surname: 'Owusu' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(repositoryMock.updateParticipantName).not.toHaveBeenCalled();
  });

  // Founder follow-up, 2026-07-24: the correction must reach certificates
  // already issued, not just the participant record going forward.
  it('retroactively renames every certificate already issued to this participant', async () => {
    await updateName('session-1', { firstName: 'Ama', middleName: null, surname: 'Owusu' });
    expect(repositoryMock.selectRegistrationIdsForParticipant).toHaveBeenCalledWith(
      'participant-1',
    );
    expect(certificatesServiceMock.renameExistingCertificates).toHaveBeenCalledWith(
      ['reg-1', 'reg-2'],
      'Ama Owusu',
    );
  });

  it('still succeeds if the retroactive certificate rename fails', async () => {
    certificatesServiceMock.renameExistingCertificates.mockRejectedValue(new Error('db down'));
    await expect(
      updateName('session-1', { firstName: 'Ama', middleName: null, surname: 'Owusu' }),
    ).resolves.toBeUndefined();
    expect(repositoryMock.updateParticipantName).toHaveBeenCalled();
  });
});

describe('requirePortalSession', () => {
  it('rejects a missing session id', async () => {
    await expect(requirePortalSession(undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an expired session', async () => {
    repositoryMock.selectSession.mockResolvedValue({
      id: 'session-1',
      participant_id: 'participant-1',
      revoked_at: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(requirePortalSession('session-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a revoked session', async () => {
    repositoryMock.selectSession.mockResolvedValue({
      id: 'session-1',
      participant_id: 'participant-1',
      revoked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await expect(requirePortalSession('session-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('ensureParticipantAuth', () => {
  it('seeds an auth row hashed from the last 4 phone digits', async () => {
    await ensureParticipantAuth('participant-2', '0245121941');
    expect(repositoryMock.insertParticipantAuthIfMissing).toHaveBeenCalledWith(
      'participant-2',
      expect.any(String),
    );
  });

  it('does nothing when the phone has fewer than 4 digits', async () => {
    await ensureParticipantAuth('participant-2', '12');
    expect(repositoryMock.insertParticipantAuthIfMissing).not.toHaveBeenCalled();
  });
});

describe('backfillParticipantAuth', () => {
  it('only seeds participants that do not already have an auth row', async () => {
    repositoryMock.selectAllActiveParticipants.mockResolvedValue([
      { id: 'p-1', phone: '0245121941' },
      { id: 'p-2', phone: '0207654321' },
    ]);
    repositoryMock.selectParticipantAuth.mockImplementation(async (id: string) =>
      id === 'p-1' ? authRow({ participant_id: 'p-1' }) : null,
    );

    const result = await backfillParticipantAuth();

    expect(result).toEqual({ totalParticipants: 2, seeded: 1 });
    expect(repositoryMock.insertParticipantAuthIfMissing).toHaveBeenCalledTimes(1);
    expect(repositoryMock.insertParticipantAuthIfMissing).toHaveBeenCalledWith(
      'p-2',
      expect.any(String),
    );
  });
});

// System review, 2026-07-22 — the Zoom join link must only ever be shown
// once payment_status is Paid, regardless of whether a personal registrant
// link or the batch's shared classroom link would otherwise be available.
describe('hasCourseEnded', () => {
  const now = new Date('2026-08-10T14:00:00Z');

  it('is false on the final day, so the last session keeps its Join button', () => {
    expect(hasCourseEnded('2026-08-10', now)).toBe(false);
  });

  it('is true the day after the course ends', () => {
    expect(hasCourseEnded('2026-08-09', now)).toBe(true);
  });

  it('is false while the course is still running', () => {
    expect(hasCourseEnded('2026-08-20', now)).toBe(false);
  });

  it('treats a missing end date as not ended rather than hiding the link', () => {
    expect(hasCourseEnded(null, now)).toBe(false);
  });
});

describe('getPortalDashboard — Zoom link visibility gate', () => {
  function dashboardRow(overrides: Record<string, unknown> = {}) {
    return {
      registration: {
        id: 'reg-1',
        batch_id: 'batch-1',
        registration_status: 'Confirmed',
        registered_at: '2026-07-01T09:00:00Z',
      },
      batch: {
        cohort_label: 'JUL-2026',
        start_date: '2026-08-01',
        start_time: '09:00',
        end_date: '2026-08-05',
        facilitator_name: 'Mr. Asante',
        zoom_link: 'https://zoom.us/j/shared-classroom',
        resources_link: 'https://drive.google.com/folder/xyz',
      },
      course: { course_name: 'ICAG Level 1 Prep', course_code: 'ICAG-L1' },
      payment: {
        payment_status: 'Unpaid',
        course_fee: '1200.00',
        original_fee: null,
        amount_paid: '0.00',
        balance: '1200.00',
      },
      zoomRegistrant: null,
      attendance: [],
      certificates: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    // Frozen mid-course (the fixture batch runs 01–05 Aug 2026). Without
    // this the suite silently changed meaning on 06 Aug 2026, when the
    // course-ended gate added on 2026-08-08 started hiding the link in every
    // "shows the link" case below — these assertions are about the ACCESS
    // gate, so the calendar must not participate.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T09:00:00Z'));
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [dashboardRow()],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the shared classroom link for an Unpaid registration even with no registrant record', async () => {
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBeNull();
  });

  it('hides the shared classroom link for a Part Payment registration', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          payment: {
            payment_status: 'Part Payment',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '400.00',
            balance: '800.00',
          },
        }),
      ],
    });
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBeNull();
  });

  it('shows the personal join link once Paid, ahead of the shared classroom link', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          payment: {
            payment_status: 'Paid',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '1200.00',
            balance: '0.00',
          },
          zoomRegistrant: { join_url: 'https://zoom.us/j/personal-link' },
        }),
      ],
    });
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBe('https://zoom.us/j/personal-link');
  });

  it('falls back to the shared classroom link when Paid but no personal registrant exists', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          payment: {
            payment_status: 'Paid',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '1200.00',
            balance: '0.00',
          },
        }),
      ],
    });
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBe('https://zoom.us/j/shared-classroom');
  });

  // The AI02 AUG-2026 cohort (2026-08-10) had a null batch zoom_link while
  // its course carried a valid classroom meeting the whole time — createBatch
  // copies the course link once at creation and never back-fills it, so a
  // batch created before its course had a meeting shows nothing forever.
  it('falls back to the Course classroom link when the batch has none', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          batch: {
            cohort_label: 'AUG-2026',
            start_date: '2026-08-01',
            start_time: '17:30',
            end_date: '2026-08-05',
            facilitator_name: 'Mr. Asante',
            zoom_link: null,
            resources_link: null,
          },
          course: {
            course_name: 'ICAG Level 1 Prep',
            course_code: 'ICAG-L1',
            zoom_link: 'https://zoom.us/j/course-classroom',
          },
          payment: {
            payment_status: 'Paid',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '1200.00',
            balance: '0.00',
          },
        }),
      ],
    });
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBe('https://zoom.us/j/course-classroom');
  });

  it('still hides the Course classroom link without access', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          batch: {
            cohort_label: 'AUG-2026',
            start_date: '2026-08-01',
            start_time: '17:30',
            end_date: '2026-08-05',
            facilitator_name: 'Mr. Asante',
            zoom_link: null,
            resources_link: null,
          },
          course: {
            course_name: 'ICAG Level 1 Prep',
            course_code: 'ICAG-L1',
            zoom_link: 'https://zoom.us/j/course-classroom',
          },
        }),
      ],
    });
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBeNull();
  });

  it('hides the course resources link for an Unpaid registration (same gate as Zoom, 2026-07-28)', async () => {
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].resourcesLink).toBeNull();
  });

  it('shows the course resources link once Paid', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          payment: {
            payment_status: 'Paid',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '1200.00',
            balance: '0.00',
          },
        }),
      ],
    });
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].resourcesLink).toBe('https://drive.google.com/folder/xyz');
  });

  // Time-boxed access (2026-08-08) — the second way to pass this gate.
  it('shows the links to a Part Payment registration that holds a live access grant', async () => {
    accessGrantsServiceMock.getAccessStatesSystem.mockResolvedValue(
      new Map([['reg-1', { hasAccess: true, until: '2026-08-13', reason: 'part_payment' }]]),
    );
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          payment: {
            payment_status: 'Part Payment',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '600.00',
            balance: '600.00',
          },
          zoomRegistrant: { join_url: 'https://zoom.us/j/personal-link' },
        }),
      ],
    });

    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBe('https://zoom.us/j/personal-link');
    expect(dashboard.registrations[0].resourcesLink).toBe('https://drive.google.com/folder/xyz');
    // Surfaced so the portal can warn instead of going dark without notice.
    expect(dashboard.registrations[0].accessExpiresOn).toBe('2026-08-13');
  });

  it('hides the links again once the grant has lapsed', async () => {
    accessGrantsServiceMock.getAccessStatesSystem.mockResolvedValue(
      new Map([['reg-1', { hasAccess: false, until: null, reason: null }]]),
    );
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          payment: {
            payment_status: 'Part Payment',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '600.00',
            balance: '600.00',
          },
          zoomRegistrant: { join_url: 'https://zoom.us/j/personal-link' },
        }),
      ],
    });

    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBeNull();
    expect(dashboard.registrations[0].accessExpiresOn).toBeNull();
  });

  // Founder-flagged 2026-08-08 — a finished cohort has no class to join, so
  // the Join button must not sit there looking live.
  it('hides the Zoom link once the course has ended, even for a Paid registration', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          batch: {
            cohort_label: 'JUL-2026',
            start_date: '2020-01-01',
            start_time: '09:00',
            end_date: '2020-01-05',
            facilitator_name: 'Mr. Asante',
            zoom_link: 'https://zoom.us/j/shared-classroom',
            resources_link: 'https://drive.google.com/folder/xyz',
          },
          payment: {
            payment_status: 'Paid',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '1200.00',
            balance: '0.00',
          },
          zoomRegistrant: { join_url: 'https://zoom.us/j/personal-link' },
        }),
      ],
    });

    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBeNull();
    // Course materials deliberately survive the course ending — they are
    // what the student paid for, not a live session.
    expect(dashboard.registrations[0].resourcesLink).toBe('https://drive.google.com/folder/xyz');
  });

  // The gate must fail CLOSED: a lookup blowing up cannot be allowed to
  // expose a classroom link to someone who has not paid.
  it('hides the links when the access lookup fails', async () => {
    accessGrantsServiceMock.getAccessStatesSystem.mockRejectedValue(new Error('db down'));
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        dashboardRow({
          payment: {
            payment_status: 'Paid',
            course_fee: '1200.00',
            original_fee: null,
            amount_paid: '1200.00',
            balance: '0.00',
          },
          zoomRegistrant: { join_url: 'https://zoom.us/j/personal-link' },
        }),
      ],
    });

    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].zoomLink).toBeNull();
    expect(dashboard.registrations[0].resourcesLink).toBeNull();
  });
});

describe('issuePortalLoginToken', () => {
  it('mints a ~5-minute token for the participant behind the registration', async () => {
    repositoryMock.selectParticipantIdForRegistration.mockResolvedValue('participant-1');
    await issuePortalLoginToken('reg-1');

    expect(repositoryMock.insertLoginToken).toHaveBeenCalledTimes(1);
    const [participantId, registrationId, expiresAt] =
      repositoryMock.insertLoginToken.mock.calls[0];
    expect(participantId).toBe('participant-1');
    expect(registrationId).toBe('reg-1');
    const minutesUntilExpiry = (new Date(expiresAt).getTime() - Date.now()) / 60000;
    expect(minutesUntilExpiry).toBeGreaterThan(4);
    expect(minutesUntilExpiry).toBeLessThanOrEqual(5);
  });

  it('does nothing when the registration cannot be resolved to a participant', async () => {
    repositoryMock.selectParticipantIdForRegistration.mockResolvedValue(null);
    await issuePortalLoginToken('reg-missing');
    expect(repositoryMock.insertLoginToken).not.toHaveBeenCalled();
  });
});

describe('exchangeLoginToken', () => {
  it('returns pending when no payment matches the reference', async () => {
    paymentsRepositoryMock.selectPaymentSummaryByTransactionIdSystem.mockResolvedValue(null);
    const result = await exchangeLoginToken('REG-unknown-123');
    expect(result).toEqual({ status: 'pending' });
  });

  it('returns pending when the matched payment is not yet Paid', async () => {
    paymentsRepositoryMock.selectPaymentSummaryByTransactionIdSystem.mockResolvedValue({
      registrationId: 'reg-1',
      paymentStatus: 'Part Payment',
    });
    const result = await exchangeLoginToken('REG-reg-1-123');
    expect(result).toEqual({ status: 'pending' });
    expect(repositoryMock.consumeLoginToken).not.toHaveBeenCalled();
  });

  it('returns invalid when Paid but no live token exists to redeem', async () => {
    paymentsRepositoryMock.selectPaymentSummaryByTransactionIdSystem.mockResolvedValue({
      registrationId: 'reg-1',
      paymentStatus: 'Paid',
    });
    repositoryMock.consumeLoginToken.mockResolvedValue(null);
    const result = await exchangeLoginToken('REG-reg-1-123');
    expect(result).toEqual({ status: 'invalid' });
  });

  it('mints a session on the first exchange and is single-use on a second attempt', async () => {
    paymentsRepositoryMock.selectPaymentSummaryByTransactionIdSystem.mockResolvedValue({
      registrationId: 'reg-1',
      paymentStatus: 'Paid',
    });
    repositoryMock.consumeLoginToken.mockResolvedValueOnce({ participantId: 'participant-1' });
    repositoryMock.insertSession.mockResolvedValue({ id: 'session-9', participant_id: 'participant-1' });

    const first = await exchangeLoginToken('REG-reg-1-123');
    expect(first).toMatchObject({ status: 'ok', sessionId: 'session-9' });

    repositoryMock.consumeLoginToken.mockResolvedValueOnce(null);
    const second = await exchangeLoginToken('REG-reg-1-123');
    expect(second).toEqual({ status: 'invalid' });
  });
});

// Student portal gap-closing (2026-07-26): receipt, message history, browse
// other courses, forgot-PIN.
function receiptDashboardRow(overrides: Record<string, unknown> = {}) {
  return {
    registration: { id: 'reg-1', batch_id: 'batch-1' },
    batch: { cohort_label: 'JUL-2026', start_date: '2026-08-01' },
    course: { course_name: 'ICAG Level 1 Prep', course_code: 'ICAG-L1' },
    payment: {
      course_fee: '1200.00',
      amount_paid: '1200.00',
      balance: '0.00',
      payment_method: 'Mobile Money',
      transaction_id: 'TXN-123',
      payment_date: '2026-07-20',
    },
    zoomRegistrant: null,
    attendance: [],
    certificates: [],
    ...overrides,
  };
}

describe('getReceiptData', () => {
  beforeEach(() => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [receiptDashboardRow()],
    });
  });

  it('returns the receipt fields for a registration owned by this session', async () => {
    const receipt = await getReceiptData('session-1', 'reg-1');
    expect(receipt).toMatchObject({
      participantName: 'Ama Owusu',
      courseName: 'ICAG Level 1 Prep',
      courseFee: 1200,
      amountPaid: 1200,
      balance: 0,
      paymentMethod: 'Mobile Money',
      transactionId: 'TXN-123',
      registrationId: 'reg-1',
    });
  });

  it('rejects a registration id that does not belong to this session', async () => {
    await expect(getReceiptData('session-1', 'reg-not-mine')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('getReceiptDataForStaff', () => {
  beforeEach(() => {
    repositoryMock.selectParticipantIdForRegistration.mockResolvedValue('participant-1');
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [receiptDashboardRow()],
    });
  });

  it('returns the receipt fields with no session required', async () => {
    const receipt = await getReceiptDataForStaff('reg-1');
    expect(receipt).toMatchObject({
      participantName: 'Ama Owusu',
      courseName: 'ICAG Level 1 Prep',
      courseFee: 1200,
      registrationId: 'reg-1',
    });
  });

  it('rejects an unknown registration id (cannot be resolved to a participant)', async () => {
    repositoryMock.selectParticipantIdForRegistration.mockResolvedValue(null);
    await expect(getReceiptDataForStaff('reg-missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repositoryMock.selectPortalDashboardData).not.toHaveBeenCalled();
  });
});

describe('getStudentStatusForStaff', () => {
  it('resolves a student by email or phone and returns their registrations', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(PARTICIPANT);
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [
        receiptDashboardRow({
          payment: {
            payment_status: 'Paid',
            course_fee: '1200.00',
            amount_paid: '1200.00',
            balance: '0.00',
            payment_method: 'Mobile Money',
            transaction_id: 'TXN-123',
            payment_date: '2026-07-20',
          },
        }),
      ],
    });

    const status = await getStudentStatusForStaff('ama@example.com');

    expect(status).toMatchObject({
      fullName: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '0245121941',
    });
    expect(status.registrations).toEqual([
      expect.objectContaining({
        registrationId: 'reg-1',
        courseName: 'ICAG Level 1 Prep',
        courseFee: 1200,
        amountPaid: 1200,
        balance: 0,
      }),
    ]);
  });

  it('throws NOT_FOUND for an unknown identifier', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(null);
    await expect(getStudentStatusForStaff('nobody@example.com')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for a soft-deleted participant', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue({
      ...PARTICIPANT,
      deleted_at: '2026-01-01T00:00:00Z',
    });
    await expect(getStudentStatusForStaff('ama@example.com')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('getOtherCourses', () => {
  it('excludes batches the participant is already registered in', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [receiptDashboardRow({ registration: { id: 'reg-1', batch_id: 'batch-1' } })],
    });
    coursesServiceMock.getActiveBatchesForPublicForm.mockResolvedValue([
      { batchId: 'batch-1', courseName: 'Already Registered' },
      { batchId: 'batch-2', courseName: 'New Course' },
    ]);

    const result = await getOtherCourses('session-1');
    expect(result).toEqual([{ batchId: 'batch-2', courseName: 'New Course' }]);
  });
});

describe('getPortalDashboard — feedbackSubmitted mapping (2026-07-27)', () => {
  it('passes the feedbackSubmitted flag straight through per registration', async () => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [receiptDashboardRow({ feedbackSubmitted: true })],
    });
    const dashboard = await getPortalDashboard('session-1');
    expect(dashboard.registrations[0].feedbackSubmitted).toBe(true);
  });
});

describe('submitPortalFeedback', () => {
  beforeEach(() => {
    repositoryMock.selectPortalDashboardData.mockResolvedValue({
      participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      registrations: [receiptDashboardRow()],
    });
  });

  it('rejects a registration id that does not belong to this session', async () => {
    await expect(
      submitPortalFeedback('session-1', 'reg-not-mine', {} as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(feedbackServiceMock.submitFeedback).not.toHaveBeenCalled();
  });

  it('delegates to feedbackService.submitFeedback for an owned registration', async () => {
    feedbackServiceMock.submitFeedback.mockResolvedValue({
      certificateIssued: true,
      certificateDownloadUrl: 'https://reg.knowsia.com/api/certificates/download/cert-1',
    });
    const input = { overallRating: 5 } as never;

    const result = await submitPortalFeedback('session-1', 'reg-1', input);

    expect(feedbackServiceMock.submitFeedback).toHaveBeenCalledWith('reg-1', input);
    expect(result).toEqual({
      certificateIssued: true,
      certificateDownloadUrl: 'https://reg.knowsia.com/api/certificates/download/cert-1',
    });
  });
});

describe('requestPinReset', () => {
  beforeEach(() => {
    repositoryMock.insertPinResetToken.mockResolvedValue({ id: 'token-1' });
    resendClientMock.sendTransactionalEmail.mockResolvedValue(undefined);
  });

  it('mints a token and emails a reset link when the identifier matches', async () => {
    await requestPinReset({ identifier: 'ama@example.com' });
    expect(repositoryMock.insertPinResetToken).toHaveBeenCalledWith(
      'participant-1',
      expect.any(String),
    );
    expect(resendClientMock.sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it('does nothing (no enumeration) when the identifier does not match any account', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(null);
    await requestPinReset({ identifier: 'nobody@example.com' });
    expect(repositoryMock.insertPinResetToken).not.toHaveBeenCalled();
    expect(resendClientMock.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe('resetPin', () => {
  it('rejects an invalid or expired token', async () => {
    repositoryMock.consumePinResetToken.mockResolvedValue(null);
    await expect(resetPin({ token: 'bad-token', newPin: '5678' })).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
    expect(repositoryMock.updateParticipantPin).not.toHaveBeenCalled();
  });

  it('updates the PIN and clears lockout on a valid token', async () => {
    repositoryMock.consumePinResetToken.mockResolvedValue({ participantId: 'participant-1' });
    await resetPin({ token: 'good-token', newPin: '5678' });
    expect(repositoryMock.updateParticipantPin).toHaveBeenCalledWith(
      'participant-1',
      expect.any(String),
    );
    expect(repositoryMock.clearLockout).toHaveBeenCalledWith('participant-1');
  });

  it('cannot be used twice — the second consume call resolves null and rejects', async () => {
    repositoryMock.consumePinResetToken.mockResolvedValueOnce({ participantId: 'participant-1' });
    await resetPin({ token: 'good-token', newPin: '5678' });

    repositoryMock.consumePinResetToken.mockResolvedValueOnce(null);
    await expect(resetPin({ token: 'good-token', newPin: '9999' })).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });
});
