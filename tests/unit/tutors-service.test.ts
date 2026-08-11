import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPin } from '@/lib/portal-auth/pin';

const tutorsRepositoryMock = {
  selectTutors: vi.fn(),
  selectTutorById: vi.fn(),
  insertTutor: vi.fn(),
  updateTutorById: vi.fn(),
  selectTutorByEmailSystem: vi.fn(),
  selectTutorByIdSystem: vi.fn(),
  updateTutorContactSystem: vi.fn(),
  selectTutorAuth: vi.fn(),
  insertTutorAuthIfMissing: vi.fn(),
  recordFailedTutorLogin: vi.fn(),
  recordSuccessfulTutorLogin: vi.fn(),
  updateTutorPin: vi.fn(),
  insertTutorSession: vi.fn(),
  selectTutorSession: vi.fn(),
  revokeTutorSession: vi.fn(),
  selectAllBatchFacilitatorLinksSystem: vi.fn(),
  selectBatchesForTutorSystem: vi.fn(),
  selectBatchForTutorSystem: vi.fn(),
  selectCoursesByIdsSystem: vi.fn(),
  selectLiveSessionsForTutorSystem: vi.fn(),
  selectRosterForBatchSystem: vi.fn(),
  selectRegisteredCountsForBatchesSystem: vi.fn(),
  selectRegistrationBelongsToBatchSystem: vi.fn(),
  insertTutorActionAuditLogSystem: vi.fn(),
  selectRecentTutorActionAuditLogSystem: vi.fn(),
  selectTutorNamesByIdsSystem: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const attendanceServiceMock = {
  getAttendanceForBatch: vi.fn(),
  getAttendanceForBatchSystem: vi.fn(),
  raiseAttendanceException: vi.fn(),
};
const certificatesServiceMock = {
  getBatchIssueContext: vi.fn(),
};
const liveSessionsServiceMock = {
  addSessionMaterial: vi.fn(),
  uploadSessionMaterialFile: vi.fn(),
  getSessionMaterialDownloadUrlSystem: vi.fn(),
  removeSessionMaterial: vi.fn(),
  getSessionMaterialsForBatchSystem: vi.fn(),
  getSessionMaterialsForBatch: vi.fn(),
};
// Assignments (2026-08-04) — modules/tutors delegates every assignment
// read/write here after proving the batch is the calling tutor's own.
const assignmentsServiceMock = {
  getAssignmentByIdSystem: vi.fn(),
  getAssignmentsForBatchSystem: vi.fn(),
  createAssignmentSystem: vi.fn(),
  updateAssignmentSystem: vi.fn(),
  deleteAssignmentSystem: vi.fn(),
  getSubmissionsForAssignmentSystem: vi.fn(),
  getSubmissionByIdSystem: vi.fn(),
  reviewSubmissionSystem: vi.fn(),
  getSubmissionDownloadUrlSystem: vi.fn(),
};
const partnersServiceMock = {
  getReferralSummaryForTutor: vi.fn(),
  ensurePartnerForTutorSystem: vi.fn(),
  getPartnerForTutorSystem: vi.fn(),
};

vi.mock('@/modules/tutors/repository', () => tutorsRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/attendance/service', () => attendanceServiceMock);
vi.mock('@/modules/certificates/service', () => certificatesServiceMock);
vi.mock('@/modules/live-sessions/service', () => liveSessionsServiceMock);
vi.mock('@/modules/partners/service', () => partnersServiceMock);
vi.mock('@/modules/assignments/service', () => assignmentsServiceMock);

const {
  listTutorsWithBatchCounts,
  createTutor,
  updateTutor,
  loginToTutorPortal,
  requireTutorPortalSession,
  changeTutorPin,
  logoutOfTutorPortal,
  updateTutorContact,
  getTutorPortalDashboard,
  getRosterForBatch,
  getAttendanceForBatch,
  getCertificateEligibilityForBatch,
  flagAttendanceException,
  addMaterialForBatch,
  removeMaterial,
  uploadMaterialForBatch,
  getMaterialDownloadUrl,
  getAssignmentsForBatch,
  createAssignmentForBatch,
  getSubmissionsForAssignment,
  reviewSubmissionForTutor,
  getSubmissionDownloadUrlForTutor,
  listTutorActivity,
  getReferralSummaryForSession,
} = await import('@/modules/tutors/service');

const ADMIN_STAFF = { id: 'staff-1', fullName: 'Jane Doe', role: 'admin' };

function tutorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tutor-1',
    full_name: 'Kwame Asante',
    email: 'kwame@example.com',
    phone: '0245121941',
    created_at: '2026-07-27T00:00:00Z',
    updated_at: '2026-07-27T00:00:00Z',
    ...overrides,
  };
}

function tutorAuthRow(overrides: Record<string, unknown> = {}) {
  return {
    tutor_id: 'tutor-1',
    pin_hash: hashPin('1941'),
    must_change_pin: false,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue(ADMIN_STAFF);
  tutorsRepositoryMock.selectRegisteredCountsForBatchesSystem.mockResolvedValue(new Map());
});

describe('listTutorsWithBatchCounts', () => {
  it('requires admin or management', async () => {
    tutorsRepositoryMock.selectTutors.mockResolvedValue([tutorRow()]);
    tutorsRepositoryMock.selectAllBatchFacilitatorLinksSystem.mockResolvedValue([]);
    await listTutorsWithBatchCounts();
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'management']);
  });

  it('counts batches per tutor from a single query, not N+1', async () => {
    tutorsRepositoryMock.selectTutors.mockResolvedValue([tutorRow({ id: 'tutor-1' }), tutorRow({ id: 'tutor-2' })]);
    tutorsRepositoryMock.selectAllBatchFacilitatorLinksSystem.mockResolvedValue([
      { facilitator_tutor_id: 'tutor-1' },
      { facilitator_tutor_id: 'tutor-1' },
      { facilitator_tutor_id: null },
    ]);
    const result = await listTutorsWithBatchCounts();
    expect(result.find((t) => t.id === 'tutor-1')?.batchCount).toBe(2);
    expect(result.find((t) => t.id === 'tutor-2')?.batchCount).toBe(0);
  });
});

describe('createTutor', () => {
  it('seeds portal auth from the last 4 digits of the phone entered', async () => {
    tutorsRepositoryMock.insertTutor.mockResolvedValue(tutorRow());
    await createTutor({ fullName: 'Kwame Asante', email: 'kwame@example.com', phone: '0245121941' });
    expect(tutorsRepositoryMock.insertTutorAuthIfMissing).toHaveBeenCalledWith('tutor-1', expect.any(String));
  });

  it('still creates the tutor even if auth seeding fails', async () => {
    tutorsRepositoryMock.insertTutor.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.insertTutorAuthIfMissing.mockRejectedValueOnce(new Error('db down'));
    await expect(
      createTutor({ fullName: 'Kwame Asante', email: 'kwame@example.com', phone: '0245121941' }),
    ).resolves.toBeDefined();
  });
});

describe('updateTutor', () => {
  it('requires admin or management', async () => {
    tutorsRepositoryMock.updateTutorById.mockResolvedValue(tutorRow());
    await updateTutor('tutor-1', { fullName: 'New Name' });
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'management']);
  });
});

describe('loginToTutorPortal', () => {
  it('returns invalid for an unknown email (no enumeration)', async () => {
    tutorsRepositoryMock.selectTutorByEmailSystem.mockResolvedValue(null);
    const result = await loginToTutorPortal({ email: 'nobody@example.com', pin: '1941' });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('logs in with the correct PIN and mints a session', async () => {
    tutorsRepositoryMock.selectTutorByEmailSystem.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(tutorAuthRow());
    tutorsRepositoryMock.insertTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
    });

    const result = await loginToTutorPortal({ email: 'kwame@example.com', pin: '1941' });

    expect(result).toMatchObject({ status: 'ok', sessionId: 'session-1' });
    expect(tutorsRepositoryMock.recordSuccessfulTutorLogin).toHaveBeenCalledWith('tutor-1');
  });

  it('self-heals a missing auth row from the tutor phone', async () => {
    tutorsRepositoryMock.selectTutorByEmailSystem.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.selectTutorAuth
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tutorAuthRow());
    tutorsRepositoryMock.insertTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
    });

    const result = await loginToTutorPortal({ email: 'kwame@example.com', pin: '1941' });

    expect(tutorsRepositoryMock.insertTutorAuthIfMissing).toHaveBeenCalledWith('tutor-1', expect.any(String));
    expect(result).toMatchObject({ status: 'ok' });
  });

  it('rejects the wrong PIN and increments failed_attempts', async () => {
    tutorsRepositoryMock.selectTutorByEmailSystem.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(tutorAuthRow());

    const result = await loginToTutorPortal({ email: 'kwame@example.com', pin: '0000' });

    expect(result).toEqual({ status: 'invalid' });
    expect(tutorsRepositoryMock.recordFailedTutorLogin).toHaveBeenCalledWith('tutor-1', {
      failed_attempts: 1,
      locked_until: null,
    });
  });

  it('locks after 5 failed attempts', async () => {
    tutorsRepositoryMock.selectTutorByEmailSystem.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(tutorAuthRow({ failed_attempts: 4 }));

    const result = await loginToTutorPortal({ email: 'kwame@example.com', pin: '0000' });

    expect(result).toEqual({ status: 'locked' });
    expect(tutorsRepositoryMock.recordFailedTutorLogin).toHaveBeenCalledWith(
      'tutor-1',
      expect.objectContaining({ failed_attempts: 0 }),
    );
  });

  it('rejects while already locked out, without re-checking the PIN', async () => {
    tutorsRepositoryMock.selectTutorByEmailSystem.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(
      tutorAuthRow({ locked_until: '2099-01-01T00:00:00Z' }),
    );

    const result = await loginToTutorPortal({ email: 'kwame@example.com', pin: '1941' });

    expect(result).toEqual({ status: 'locked' });
    expect(tutorsRepositoryMock.recordFailedTutorLogin).not.toHaveBeenCalled();
  });
});

describe('requireTutorPortalSession', () => {
  it('throws UNAUTHENTICATED with no session id', async () => {
    await expect(requireTutorPortalSession(undefined)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('throws UNAUTHENTICATED for an expired session', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2020-01-01T00:00:00Z',
      revoked_at: null,
    });
    await expect(requireTutorPortalSession('session-1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('throws UNAUTHENTICATED for a revoked session', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: '2026-07-27T00:00:00Z',
    });
    await expect(requireTutorPortalSession('session-1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('returns the scoped tutorId for a valid session', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    await expect(requireTutorPortalSession('session-1')).resolves.toEqual({ tutorId: 'tutor-1' });
  });
});

describe('getReferralSummaryForSession — Knowsia Growth Partner Programme (2026-08-02)', () => {
  it('rejects without a valid tutor session, before ever calling partnersService', async () => {
    await expect(getReferralSummaryForSession(undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(partnersServiceMock.getReferralSummaryForTutor).not.toHaveBeenCalled();
  });

  it('resolves the session to a tutorId, then delegates to partnersService', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    // The 2026-08-02 auto-provisioning follow-up added a
    // `selectTutorByIdSystem` lookup (returning null short-circuits the whole
    // function) plus an ensurePartnerForTutorSystem call ahead of the
    // delegation this test asserts. Both need stubbing or the function
    // returns null before ever reaching getReferralSummaryForTutor.
    tutorsRepositoryMock.selectTutorByIdSystem.mockResolvedValue(tutorRow());
    partnersServiceMock.ensurePartnerForTutorSystem.mockResolvedValue(undefined);
    partnersServiceMock.getReferralSummaryForTutor.mockResolvedValue({
      codes: [],
      commissionTotals: {},
      recentPayouts: [],
    });
    const result = await getReferralSummaryForSession('session-1');
    expect(partnersServiceMock.getReferralSummaryForTutor).toHaveBeenCalledWith('tutor-1');
    expect(result).toEqual({ codes: [], commissionTotals: {}, recentPayouts: [] });
  });
});

describe('changeTutorPin', () => {
  it('rejects the wrong current PIN', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(tutorAuthRow());

    await expect(
      changeTutorPin('session-1', { currentPin: '0000', newPin: '5678' }),
    ).rejects.toMatchObject({ code: 'INVALID_PIN' });
    expect(tutorsRepositoryMock.updateTutorPin).not.toHaveBeenCalled();
  });
});

describe('logoutOfTutorPortal', () => {
  it('revokes the session', async () => {
    await logoutOfTutorPortal('session-1');
    expect(tutorsRepositoryMock.revokeTutorSession).toHaveBeenCalledWith('session-1');
  });

  it('does nothing without a session id', async () => {
    await logoutOfTutorPortal(undefined);
    expect(tutorsRepositoryMock.revokeTutorSession).not.toHaveBeenCalled();
  });
});

describe('updateTutorContact', () => {
  it('updates the tutor scoped to their own session', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    await updateTutorContact('session-1', { fullName: 'New Name', phone: '0207654321' });
    expect(tutorsRepositoryMock.updateTutorContactSystem).toHaveBeenCalledWith('tutor-1', {
      full_name: 'New Name',
      phone: '0207654321',
    });
  });
});

describe('getTutorPortalDashboard', () => {
  it('returns batches and live sessions scoped to the session tutor', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    tutorsRepositoryMock.selectTutorByIdSystem.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(tutorAuthRow());
    tutorsRepositoryMock.selectBatchesForTutorSystem.mockResolvedValue([
      {
        id: 'batch-1',
        course_id: 'course-1',
        cohort_label: 'JUL-2026',
        start_date: '2026-07-01',
        end_date: '2026-08-01',
        zoom_link: 'https://zoom.us/j/123',
      },
    ]);
    tutorsRepositoryMock.selectCoursesByIdsSystem.mockResolvedValue([
      { id: 'course-1', course_name: 'ICAG Level 1 Prep' },
    ]);
    tutorsRepositoryMock.selectLiveSessionsForTutorSystem.mockResolvedValue([
      {
        id: 'ls-1',
        batch_id: 'batch-1',
        title: 'Session 1',
        starts_at: '2026-07-05T09:00:00Z',
        ends_at: '2026-07-05T11:00:00Z',
        status: 'scheduled',
      },
    ]);

    tutorsRepositoryMock.selectRegisteredCountsForBatchesSystem.mockResolvedValue(
      new Map([['batch-1', 12]]),
    );

    const dashboard = await getTutorPortalDashboard('session-1');

    expect(dashboard.batches).toEqual([
      {
        batchId: 'batch-1',
        courseName: 'ICAG Level 1 Prep',
        cohortLabel: 'JUL-2026',
        startDate: '2026-07-01',
        endDate: '2026-08-01',
        zoomLink: 'https://zoom.us/j/123',
        registeredCount: 12,
      },
    ]);
    expect(dashboard.liveSessions).toHaveLength(1);
    expect(tutorsRepositoryMock.selectLiveSessionsForTutorSystem).toHaveBeenCalledWith('tutor-1', ['batch-1']);
  });

  // The tutor is who starts the class, so a batch with no zoom_link of its
  // own left nobody with a way in — the AI02 AUG-2026 case (2026-08-11).
  it('falls back to the Course classroom link when the batch has none', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    tutorsRepositoryMock.selectTutorByIdSystem.mockResolvedValue(tutorRow());
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(tutorAuthRow());
    tutorsRepositoryMock.selectBatchesForTutorSystem.mockResolvedValue([
      {
        id: 'batch-1',
        course_id: 'course-1',
        cohort_label: 'AUG-2026',
        start_date: '2026-08-10',
        end_date: '2026-08-14',
        zoom_link: null,
      },
    ]);
    tutorsRepositoryMock.selectCoursesByIdsSystem.mockResolvedValue([
      {
        id: 'course-1',
        course_name: 'ICAG Level 1 Prep',
        zoom_link: 'https://zoom.us/j/course-classroom',
      },
    ]);
    tutorsRepositoryMock.selectLiveSessionsForTutorSystem.mockResolvedValue([]);
    tutorsRepositoryMock.selectRegisteredCountsForBatchesSystem.mockResolvedValue(
      new Map([['batch-1', 43]]),
    );

    const dashboard = await getTutorPortalDashboard('session-1');

    expect(dashboard.batches[0].zoomLink).toBe('https://zoom.us/j/course-classroom');
  });
});

describe('batch-scoped reads reject a batch that does not belong to the calling tutor', () => {
  beforeEach(() => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
  });

  it('getRosterForBatch', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(getRosterForBatch('session-1', 'batch-not-mine')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tutorsRepositoryMock.selectRosterForBatchSystem).not.toHaveBeenCalled();
  });

  it('getAttendanceForBatch', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(getAttendanceForBatch('session-1', 'batch-not-mine')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(attendanceServiceMock.getAttendanceForBatchSystem).not.toHaveBeenCalled();
  });

  it('getCertificateEligibilityForBatch', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(getCertificateEligibilityForBatch('session-1', 'batch-not-mine')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(certificatesServiceMock.getBatchIssueContext).not.toHaveBeenCalled();
  });

  // Learning resource uploads + assignments (2026-08-04) — the same
  // "never trust a client-supplied id" posture as every read above.

  it('uploadMaterialForBatch rejects a batch that is not this tutor’s, before touching R2', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(
      uploadMaterialForBatch(
        'session-1',
        { batchId: 'batch-not-mine', title: 'Slides' },
        {
          buffer: Buffer.from('x'),
          contentType: 'application/pdf',
          extension: 'pdf',
          fileName: 'slides.pdf',
          sizeBytes: 10,
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(liveSessionsServiceMock.uploadSessionMaterialFile).not.toHaveBeenCalled();
  });

  it('getMaterialDownloadUrl rejects a material belonging to another tutor’s batch', async () => {
    liveSessionsServiceMock.getSessionMaterialDownloadUrlSystem.mockResolvedValue({
      url: 'https://r2.example/signed',
      batchId: 'batch-not-mine',
      fileName: 'slides.pdf',
    });
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(getMaterialDownloadUrl('session-1', 'material-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('getAssignmentsForBatch rejects a batch that is not this tutor’s', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(getAssignmentsForBatch('session-1', 'batch-not-mine')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(assignmentsServiceMock.getAssignmentsForBatchSystem).not.toHaveBeenCalled();
  });

  it('createAssignmentForBatch attributes the assignment to the session’s own tutor', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue({
      id: 'batch-1',
      facilitator_tutor_id: 'tutor-1',
    });
    assignmentsServiceMock.createAssignmentSystem.mockResolvedValue({ id: 'assignment-1' });
    await createAssignmentForBatch('session-1', { batchId: 'batch-1', title: 'Case study' });
    expect(assignmentsServiceMock.createAssignmentSystem).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: 'batch-1' }),
      { tutorId: 'tutor-1' },
    );
  });

  it('getSubmissionsForAssignment rejects an assignment on another tutor’s batch', async () => {
    assignmentsServiceMock.getAssignmentByIdSystem.mockResolvedValue({
      id: 'assignment-1',
      batchId: 'batch-not-mine',
    });
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(getSubmissionsForAssignment('session-1', 'assignment-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(assignmentsServiceMock.getSubmissionsForAssignmentSystem).not.toHaveBeenCalled();
  });

  it('getSubmissionsForAssignment merges learner names from the roster, with no payment field', async () => {
    assignmentsServiceMock.getAssignmentByIdSystem.mockResolvedValue({
      id: 'assignment-1',
      batchId: 'batch-1',
    });
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue({
      id: 'batch-1',
      facilitator_tutor_id: 'tutor-1',
    });
    assignmentsServiceMock.getSubmissionsForAssignmentSystem.mockResolvedValue([
      {
        id: 'submission-1',
        assignmentId: 'assignment-1',
        registrationId: 'reg-1',
        fileName: 'answer.pdf',
        fileSizeBytes: 1024,
        contentType: 'application/pdf',
        participantNotes: null,
        submittedAt: '2026-08-04T10:00:00Z',
        status: 'submitted',
        grade: null,
        feedback: null,
        reviewedByTutorId: null,
        reviewedByStaffId: null,
        reviewedAt: null,
      },
    ]);
    tutorsRepositoryMock.selectRosterForBatchSystem.mockResolvedValue([
      {
        registration: { id: 'reg-1', registration_status: 'Confirmed', registered_at: '2026-08-01' },
        participant: { full_name: 'Ama Mensah', email: 'ama@example.com', phone: '0244000000' },
      },
    ]);

    const [entry] = await getSubmissionsForAssignment('session-1', 'assignment-1');

    expect(entry.participantName).toBe('Ama Mensah');
    expect(entry.participantEmail).toBe('ama@example.com');
    // BR-33: no payment/financial field ever reaches a tutor. Matched on
    // whole keys so the legitimate "feedback" field isn't caught by "fee".
    expect(Object.keys(entry)).not.toContain(
      expect.stringMatching(/^(amountPaid|courseFee|balance|paymentStatus)$/),
    );
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining(['participantName', 'participantEmail', 'submissionId']),
    );
  });

  it('reviewSubmissionForTutor resolves ownership from the submission, not from client input', async () => {
    assignmentsServiceMock.getSubmissionByIdSystem.mockResolvedValue({
      id: 'submission-1',
      assignmentId: 'assignment-1',
    });
    assignmentsServiceMock.getAssignmentByIdSystem.mockResolvedValue({
      id: 'assignment-1',
      batchId: 'batch-not-mine',
    });
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);

    await expect(
      reviewSubmissionForTutor('session-1', 'submission-1', { grade: 90 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(assignmentsServiceMock.reviewSubmissionSystem).not.toHaveBeenCalled();
  });

  it('getSubmissionDownloadUrlForTutor authorizes before ever signing a URL', async () => {
    assignmentsServiceMock.getSubmissionByIdSystem.mockResolvedValue({
      id: 'submission-1',
      assignmentId: 'assignment-1',
    });
    assignmentsServiceMock.getAssignmentByIdSystem.mockResolvedValue({
      id: 'assignment-1',
      batchId: 'batch-not-mine',
    });
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);

    await expect(
      getSubmissionDownloadUrlForTutor('session-1', 'submission-1'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(assignmentsServiceMock.getSubmissionDownloadUrlSystem).not.toHaveBeenCalled();
  });

  it('getRosterForBatch never selects payment fields, only name/email/phone/status', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue({ id: 'batch-1', facilitator_tutor_id: 'tutor-1' });
    tutorsRepositoryMock.selectRosterForBatchSystem.mockResolvedValue([
      {
        registration: {
          id: 'reg-1',
          registration_status: 'Confirmed',
          registered_at: '2026-07-01T00:00:00Z',
        },
        participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
      },
    ]);

    const roster = await getRosterForBatch('session-1', 'batch-1');

    expect(roster).toEqual([
      {
        registrationId: 'reg-1',
        fullName: 'Ama Owusu',
        email: 'ama@example.com',
        phone: '0245121941',
        registrationStatus: 'Confirmed',
        registeredAt: '2026-07-01T00:00:00Z',
      },
    ]);
  });

  it('getAttendanceForBatch uses the service-role read, not the RLS-gated staff read', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue({ id: 'batch-1', facilitator_tutor_id: 'tutor-1' });
    attendanceServiceMock.getAttendanceForBatchSystem.mockResolvedValue([]);

    await getAttendanceForBatch('session-1', 'batch-1');

    expect(attendanceServiceMock.getAttendanceForBatchSystem).toHaveBeenCalledWith('batch-1');
    expect(attendanceServiceMock.getAttendanceForBatch).not.toHaveBeenCalled();
  });
});

describe('flagAttendanceException (Tutor Portal Phase 4)', () => {
  beforeEach(() => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue({ id: 'batch-1', facilitator_tutor_id: 'tutor-1' });
  });

  it('rejects a batch that does not belong to the calling tutor', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(
      flagAttendanceException('session-1', {
        registrationId: 'reg-1',
        batchId: 'batch-not-mine',
        sessionDate: '2026-07-01',
        exceptionType: 'no_show_flag',
        reason: 'No response on Zoom.',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(attendanceServiceMock.raiseAttendanceException).not.toHaveBeenCalled();
  });

  it('rejects a registration that is not on this batch roster', async () => {
    tutorsRepositoryMock.selectRegistrationBelongsToBatchSystem.mockResolvedValue(false);
    await expect(
      flagAttendanceException('session-1', {
        registrationId: 'reg-not-on-batch',
        batchId: 'batch-1',
        sessionDate: '2026-07-01',
        exceptionType: 'no_show_flag',
        reason: 'No response on Zoom.',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(attendanceServiceMock.raiseAttendanceException).not.toHaveBeenCalled();
  });

  it('raises the exception and logs the tutor action on the happy path', async () => {
    tutorsRepositoryMock.selectRegistrationBelongsToBatchSystem.mockResolvedValue(true);
    await flagAttendanceException('session-1', {
      registrationId: 'reg-1',
      batchId: 'batch-1',
      sessionDate: '2026-07-01',
      exceptionType: 'correction_request',
      reason: 'Zoom dropped mid-class.',
      requestedPresent: true,
    });

    expect(attendanceServiceMock.raiseAttendanceException).toHaveBeenCalledWith({
      registrationId: 'reg-1',
      batchId: 'batch-1',
      sessionDate: '2026-07-01',
      exceptionType: 'correction_request',
      reason: 'Zoom dropped mid-class.',
      requestedPresent: true,
      raisedByTutorId: 'tutor-1',
    });
    expect(tutorsRepositoryMock.insertTutorActionAuditLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ tutor_id: 'tutor-1', action_type: 'attendance_exception_raised' }),
    );
  });
});

describe('Session Materials (Tutor Portal Phase 4)', () => {
  beforeEach(() => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue({ id: 'batch-1', facilitator_tutor_id: 'tutor-1' });
  });

  it('addMaterialForBatch rejects a batch that does not belong to the calling tutor', async () => {
    tutorsRepositoryMock.selectBatchForTutorSystem.mockResolvedValue(null);
    await expect(
      addMaterialForBatch('session-1', { batchId: 'batch-not-mine', title: 'Slides', link: 'https://example.com/x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(liveSessionsServiceMock.addSessionMaterial).not.toHaveBeenCalled();
  });

  it('addMaterialForBatch adds the material scoped to the tutor and logs the action', async () => {
    liveSessionsServiceMock.addSessionMaterial.mockResolvedValue({ id: 'mat-1' });
    await addMaterialForBatch('session-1', {
      batchId: 'batch-1',
      title: 'Session 3 slides',
      link: 'https://example.com/slides',
    });

    expect(liveSessionsServiceMock.addSessionMaterial).toHaveBeenCalledWith({
      batchId: 'batch-1',
      liveSessionId: null,
      uploadedByTutorId: 'tutor-1',
      title: 'Session 3 slides',
      link: 'https://example.com/slides',
    });
    expect(tutorsRepositoryMock.insertTutorActionAuditLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ tutor_id: 'tutor-1', action_type: 'material_added' }),
    );
  });

  it('removeMaterial delegates ownership enforcement to liveSessionsService', async () => {
    await removeMaterial('session-1', 'mat-1', 'batch-1');
    expect(liveSessionsServiceMock.removeSessionMaterial).toHaveBeenCalledWith('mat-1', 'tutor-1');
  });
});

describe('listTutorActivity (staff-facing)', () => {
  it('requires admin or management and resolves tutor names', async () => {
    tutorsRepositoryMock.selectRecentTutorActionAuditLogSystem.mockResolvedValue([
      {
        id: 'log-1',
        tutor_id: 'tutor-1',
        action_type: 'pin_changed',
        target_batch_id: null,
        details: {},
        created_at: '2026-07-31T00:00:00Z',
      },
    ]);
    tutorsRepositoryMock.selectTutorNamesByIdsSystem.mockResolvedValue([
      { id: 'tutor-1', full_name: 'Kwame Asante' },
    ]);

    const activity = await listTutorActivity();

    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'management']);
    expect(activity).toEqual([
      {
        id: 'log-1',
        tutorId: 'tutor-1',
        tutorName: 'Kwame Asante',
        actionType: 'pin_changed',
        targetBatchId: null,
        details: {},
        createdAt: '2026-07-31T00:00:00Z',
      },
    ]);
  });
});

describe('tutor action audit logging on existing self-service actions', () => {
  it('changeTutorPin logs pin_changed', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });
    tutorsRepositoryMock.selectTutorAuth.mockResolvedValue(tutorAuthRow());

    await changeTutorPin('session-1', { currentPin: '1941', newPin: '5678' });

    expect(tutorsRepositoryMock.insertTutorActionAuditLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ tutor_id: 'tutor-1', action_type: 'pin_changed' }),
    );
  });

  it('updateTutorContact logs contact_updated', async () => {
    tutorsRepositoryMock.selectTutorSession.mockResolvedValue({
      id: 'session-1',
      tutor_id: 'tutor-1',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    });

    await updateTutorContact('session-1', { fullName: 'New Name', phone: '0207654321' });

    expect(tutorsRepositoryMock.insertTutorActionAuditLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ tutor_id: 'tutor-1', action_type: 'contact_updated' }),
    );
  });
});
