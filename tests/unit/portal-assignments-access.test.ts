import { beforeEach, describe, expect, it, vi } from 'vitest';

// Student-portal access control for learning resources and assignment
// submissions (founder-requested 2026-08-04).
//
// These tables carry no participant-facing RLS policy — a portal session is
// not a Supabase Auth session, so the service layer IS the security boundary
// (same posture as session_materials and payment_submissions). What follows
// pins down the two checks that boundary rests on: the registration must
// belong to the calling session, AND the material/assignment must belong to
// that registration's own batch. A separate test file from
// portal-service.test.ts because these need modules/assignments mocked,
// which that file deliberately does not do.

const repositoryMock = {
  selectSession: vi.fn(),
  selectPortalDashboardData: vi.fn(),
};
const assignmentsServiceMock = {
  getAssignmentByIdSystem: vi.fn(),
  getAssignmentsForRegistrationSystem: vi.fn(),
  submitAssignmentSystem: vi.fn(),
  getSubmissionByIdSystem: vi.fn(),
  getSubmissionDownloadUrlSystem: vi.fn(),
};
const liveSessionsServiceMock = {
  getSessionMaterialsForBatchSystem: vi.fn(),
  getSessionMaterialBatchIdSystem: vi.fn(),
  getSessionMaterialDownloadUrlSystem: vi.fn(),
};

vi.mock('@/modules/portal/repository', () => repositoryMock);
vi.mock('@/modules/assignments/service', () => assignmentsServiceMock);
vi.mock('@/modules/live-sessions/service', () => liveSessionsServiceMock);
vi.mock('@/modules/payments/repository', () => ({}));
vi.mock('@/modules/payments/service', () => ({}));
vi.mock('@/modules/certificates/service', () => ({}));
vi.mock('@/modules/courses/service', () => ({}));
vi.mock('@/modules/feedback/service', () => ({}));
vi.mock('@/modules/communications/service', () => ({}));
vi.mock('@/modules/partners/service', () => ({}));
vi.mock('@/lib/resend/client', () => ({ sendTransactionalEmail: vi.fn() }));

const {
  getAssignments,
  submitAssignment,
  getMySubmissionDownloadUrl,
  getMaterialDownloadUrl,
} = await import('@/modules/portal/service');

const FILE = {
  buffer: Buffer.from('pdf'),
  contentType: 'application/pdf',
  extension: 'pdf',
  fileName: 'answer.pdf',
  sizeBytes: 1024,
};

// A dashboard containing exactly one registration, on batch-1.
function ownDashboard() {
  return {
    participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: '0245121941' },
    registrations: [
      {
        registration: { id: 'reg-mine', batch_id: 'batch-1' },
        batch: { id: 'batch-1', cohort_label: 'Aug 2026' },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMock.selectSession.mockResolvedValue({
    id: 'session-1',
    participant_id: 'participant-1',
    expires_at: '2099-01-01T00:00:00Z',
    revoked_at: null,
  });
  repositoryMock.selectPortalDashboardData.mockResolvedValue(ownDashboard());
});

describe('getAssignments', () => {
  it('requires a live session before reading anything', async () => {
    await expect(getAssignments(undefined, 'reg-mine')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(assignmentsServiceMock.getAssignmentsForRegistrationSystem).not.toHaveBeenCalled();
  });

  it('404s on a registration that is not this session’s, without reading assignments', async () => {
    await expect(getAssignments('session-1', 'reg-someone-else')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(assignmentsServiceMock.getAssignmentsForRegistrationSystem).not.toHaveBeenCalled();
  });

  it('scopes the read to the registration’s own batch and registration id', async () => {
    assignmentsServiceMock.getAssignmentsForRegistrationSystem.mockResolvedValue([]);
    await getAssignments('session-1', 'reg-mine');
    expect(assignmentsServiceMock.getAssignmentsForRegistrationSystem).toHaveBeenCalledWith(
      'batch-1',
      'reg-mine',
    );
  });
});

describe('submitAssignment', () => {
  it('404s on a registration that is not this session’s', async () => {
    await expect(
      submitAssignment(
        'session-1',
        { assignmentId: 'assignment-1', registrationId: 'reg-someone-else' },
        FILE,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(assignmentsServiceMock.submitAssignmentSystem).not.toHaveBeenCalled();
  });

  // The interesting one: the learner owns the registration, but the
  // assignment belongs to a different cohort. Checking only the registration
  // would let them submit against another batch's assignment.
  it('404s when the assignment belongs to a different batch than the registration', async () => {
    assignmentsServiceMock.getAssignmentByIdSystem.mockResolvedValue({
      id: 'assignment-1',
      batchId: 'batch-other',
    });
    await expect(
      submitAssignment(
        'session-1',
        { assignmentId: 'assignment-1', registrationId: 'reg-mine' },
        FILE,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(assignmentsServiceMock.submitAssignmentSystem).not.toHaveBeenCalled();
  });

  it('delegates once both the registration and the assignment check out', async () => {
    assignmentsServiceMock.getAssignmentByIdSystem.mockResolvedValue({
      id: 'assignment-1',
      batchId: 'batch-1',
    });
    assignmentsServiceMock.submitAssignmentSystem.mockResolvedValue({ id: 'submission-1' });

    await submitAssignment(
      'session-1',
      { assignmentId: 'assignment-1', registrationId: 'reg-mine', participantNotes: 'Here it is' },
      FILE,
    );

    expect(assignmentsServiceMock.submitAssignmentSystem).toHaveBeenCalledWith({
      assignmentId: 'assignment-1',
      registrationId: 'reg-mine',
      participantNotes: 'Here it is',
      file: FILE,
    });
  });
});

describe('getMySubmissionDownloadUrl', () => {
  it('refuses a submission belonging to another learner, without signing a URL', async () => {
    assignmentsServiceMock.getSubmissionByIdSystem.mockResolvedValue({
      id: 'submission-9',
      assignmentId: 'assignment-1',
      registrationId: 'reg-someone-else',
    });
    await expect(
      getMySubmissionDownloadUrl('session-1', 'reg-mine', 'submission-9'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(assignmentsServiceMock.getSubmissionDownloadUrlSystem).not.toHaveBeenCalled();
  });

  it('signs the learner’s own submission back to them', async () => {
    assignmentsServiceMock.getSubmissionByIdSystem.mockResolvedValue({
      id: 'submission-1',
      assignmentId: 'assignment-1',
      registrationId: 'reg-mine',
    });
    assignmentsServiceMock.getSubmissionDownloadUrlSystem.mockResolvedValue({
      url: 'https://r2.example/signed',
    });
    await expect(
      getMySubmissionDownloadUrl('session-1', 'reg-mine', 'submission-1'),
    ).resolves.toBe('https://r2.example/signed');
  });
});

describe('getMaterialDownloadUrl', () => {
  it('refuses a material from another cohort even for an owned registration', async () => {
    liveSessionsServiceMock.getSessionMaterialBatchIdSystem.mockResolvedValue('batch-other');
    await expect(
      getMaterialDownloadUrl('session-1', 'reg-mine', 'material-1'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Authorization now precedes signing (2026-08-13): a refused request must
    // never have caused a presigned URL to exist in the first place.
    expect(liveSessionsServiceMock.getSessionMaterialDownloadUrlSystem).not.toHaveBeenCalled();
  });

  it('returns the signed URL for a material on the registration’s own batch', async () => {
    liveSessionsServiceMock.getSessionMaterialBatchIdSystem.mockResolvedValue('batch-1');
    liveSessionsServiceMock.getSessionMaterialDownloadUrlSystem.mockResolvedValue({
      url: 'https://r2.example/signed',
      batchId: 'batch-1',
      fileName: 'slides.pdf',
    });
    await expect(getMaterialDownloadUrl('session-1', 'reg-mine', 'material-1')).resolves.toBe(
      'https://r2.example/signed',
    );
  });
});
