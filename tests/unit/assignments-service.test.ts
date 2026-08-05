import { beforeEach, describe, expect, it, vi } from 'vitest';

// Assignments and student submissions (founder-requested 2026-08-04).
// The rules worth pinning down here are the ones that protect learners'
// work: a closed assignment refuses submissions, a no-resubmission
// assignment refuses a second one, and a permitted resubmission clears the
// grade given against the file it replaces.

const assignmentsRepositoryMock = {
  insertAssignmentSystem: vi.fn(),
  selectAssignmentByIdSystem: vi.fn(),
  selectAssignmentsForBatchSystem: vi.fn(),
  updateAssignmentSystem: vi.fn(),
  deleteAssignmentSystem: vi.fn(),
  selectAssignmentsForBatch: vi.fn(),
  upsertSubmissionSystem: vi.fn(),
  selectSubmissionByIdSystem: vi.fn(),
  selectSubmissionsForAssignmentSystem: vi.fn(),
  selectSubmissionsForAssignmentIdsSystem: vi.fn(),
  selectSubmissionsForRegistrationSystem: vi.fn(),
  updateSubmissionSystem: vi.fn(),
};
const usersServiceMock = { requireRole: vi.fn() };
const r2ClientMock = {
  isR2Configured: vi.fn(),
  uploadObject: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
};

vi.mock('@/modules/assignments/repository', () => assignmentsRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/lib/r2/client', () => r2ClientMock);

const {
  createAssignmentSystem,
  getAssignmentsForBatchSystem,
  getAssignmentsForRegistrationSystem,
  submitAssignmentSystem,
  reviewSubmissionSystem,
  getSubmissionDownloadUrlSystem,
  createAssignmentAsStaff,
} = await import('@/modules/assignments/service');

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-1',
    batch_id: 'batch-1',
    live_session_id: null,
    title: 'Case study — risk register',
    instructions: null,
    due_at: null,
    status: 'open',
    allow_resubmission: true,
    created_by_tutor_id: 'tutor-1',
    created_by_staff_id: null,
    created_at: '2026-08-04T00:00:00Z',
    ...overrides,
  };
}

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'submission-1',
    assignment_id: 'assignment-1',
    registration_id: 'registration-1',
    file_path: 'assignments/assignment-1/registration-1/abc.pdf',
    file_name: 'answer.pdf',
    file_size_bytes: 1024,
    content_type: 'application/pdf',
    participant_notes: null,
    submitted_at: '2026-08-04T10:00:00Z',
    status: 'submitted',
    grade: null,
    feedback: null,
    reviewed_by_tutor_id: null,
    reviewed_by_staff_id: null,
    reviewed_at: null,
    ...overrides,
  };
}

const file = {
  buffer: Buffer.from('pdf-bytes'),
  contentType: 'application/pdf',
  extension: 'pdf',
  fileName: 'answer.pdf',
  sizeBytes: 1024,
};

beforeEach(() => {
  vi.clearAllMocks();
  r2ClientMock.isR2Configured.mockReturnValue(true);
  assignmentsRepositoryMock.selectSubmissionsForRegistrationSystem.mockResolvedValue([]);
  assignmentsRepositoryMock.selectSubmissionsForAssignmentIdsSystem.mockResolvedValue([]);
});

describe('createAssignmentSystem', () => {
  it('records exactly one author — a tutor or a staff member, never both', async () => {
    assignmentsRepositoryMock.insertAssignmentSystem.mockResolvedValue(assignmentRow());
    await createAssignmentSystem(
      { batchId: 'batch-1', title: 'Case study — risk register' },
      { tutorId: 'tutor-1' },
    );
    expect(assignmentsRepositoryMock.insertAssignmentSystem).toHaveBeenCalledWith(
      expect.objectContaining({ created_by_tutor_id: 'tutor-1', created_by_staff_id: null }),
    );
  });

  it('defaults allow_resubmission to true when unspecified', async () => {
    assignmentsRepositoryMock.insertAssignmentSystem.mockResolvedValue(assignmentRow());
    await createAssignmentSystem({ batchId: 'batch-1', title: 'Untitled work' }, { tutorId: 't1' });
    expect(assignmentsRepositoryMock.insertAssignmentSystem).toHaveBeenCalledWith(
      expect.objectContaining({ allow_resubmission: true }),
    );
  });
});

describe('createAssignmentAsStaff', () => {
  it('is admin-gated and attributes the assignment to the acting staff member', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-9', role: 'admin' });
    assignmentsRepositoryMock.insertAssignmentSystem.mockResolvedValue(assignmentRow());
    await createAssignmentAsStaff({ batchId: 'batch-1', title: 'Admin-set work' });
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
    expect(assignmentsRepositoryMock.insertAssignmentSystem).toHaveBeenCalledWith(
      expect.objectContaining({ created_by_staff_id: 'staff-9', created_by_tutor_id: null }),
    );
  });
});

describe('submitAssignmentSystem', () => {
  it('refuses a submission to a closed assignment, and never touches R2', async () => {
    assignmentsRepositoryMock.selectAssignmentByIdSystem.mockResolvedValue(
      assignmentRow({ status: 'closed' }),
    );
    await expect(
      submitAssignmentSystem({
        assignmentId: 'assignment-1',
        registrationId: 'registration-1',
        participantNotes: null,
        file,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(r2ClientMock.uploadObject).not.toHaveBeenCalled();
    expect(assignmentsRepositoryMock.upsertSubmissionSystem).not.toHaveBeenCalled();
  });

  it('refuses a second submission when the tutor disallowed resubmission', async () => {
    assignmentsRepositoryMock.selectAssignmentByIdSystem.mockResolvedValue(
      assignmentRow({ allow_resubmission: false }),
    );
    assignmentsRepositoryMock.selectSubmissionsForRegistrationSystem.mockResolvedValue([
      submissionRow(),
    ]);
    await expect(
      submitAssignmentSystem({
        assignmentId: 'assignment-1',
        registrationId: 'registration-1',
        participantNotes: null,
        file,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(r2ClientMock.uploadObject).not.toHaveBeenCalled();
  });

  it('uploads to R2 before inserting, so a row never points at a missing object', async () => {
    assignmentsRepositoryMock.selectAssignmentByIdSystem.mockResolvedValue(assignmentRow());
    assignmentsRepositoryMock.upsertSubmissionSystem.mockResolvedValue(submissionRow());

    const order: string[] = [];
    r2ClientMock.uploadObject.mockImplementation(async () => void order.push('upload'));
    assignmentsRepositoryMock.upsertSubmissionSystem.mockImplementation(async () => {
      order.push('insert');
      return submissionRow();
    });

    await submitAssignmentSystem({
      assignmentId: 'assignment-1',
      registrationId: 'registration-1',
      participantNotes: null,
      file,
    });
    expect(order).toEqual(['upload', 'insert']);
  });

  it('scopes the R2 key by assignment and registration, and ignores the client filename', async () => {
    assignmentsRepositoryMock.selectAssignmentByIdSystem.mockResolvedValue(assignmentRow());
    assignmentsRepositoryMock.upsertSubmissionSystem.mockResolvedValue(submissionRow());
    await submitAssignmentSystem({
      assignmentId: 'assignment-1',
      registrationId: 'registration-1',
      participantNotes: null,
      file: { ...file, fileName: '../../etc/passwd' },
    });
    // Layout itself is owned by lib/r2/keys.ts (see r2-keys.test.ts); this
    // asserts the service hands it the right ids and the validated extension.
    const key = r2ClientMock.uploadObject.mock.calls[0][0].key as string;
    expect(key).toMatch(/^submissions\/assignment-1\/registration-1\/[0-9a-f-]+\.pdf$/);
    expect(key).not.toContain('..');
  });

  it('clears any prior grade when a resubmission replaces the file it was given for', async () => {
    assignmentsRepositoryMock.selectAssignmentByIdSystem.mockResolvedValue(assignmentRow());
    assignmentsRepositoryMock.selectSubmissionsForRegistrationSystem.mockResolvedValue([
      submissionRow({ status: 'reviewed', grade: 82, feedback: 'Solid work', reviewed_by_tutor_id: 'tutor-1' }),
    ]);
    assignmentsRepositoryMock.upsertSubmissionSystem.mockResolvedValue(submissionRow());

    await submitAssignmentSystem({
      assignmentId: 'assignment-1',
      registrationId: 'registration-1',
      participantNotes: 'Second attempt',
      file,
    });

    expect(assignmentsRepositoryMock.upsertSubmissionSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'submission-1',
        status: 'submitted',
        grade: null,
        feedback: null,
        reviewed_by_tutor_id: null,
        reviewed_at: null,
      }),
    );
  });

  it('fails cleanly when R2 is not configured, without writing a row', async () => {
    r2ClientMock.isR2Configured.mockReturnValue(false);
    assignmentsRepositoryMock.selectAssignmentByIdSystem.mockResolvedValue(assignmentRow());
    await expect(
      submitAssignmentSystem({
        assignmentId: 'assignment-1',
        registrationId: 'registration-1',
        participantNotes: null,
        file,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(assignmentsRepositoryMock.upsertSubmissionSystem).not.toHaveBeenCalled();
  });
});

describe('getAssignmentsForRegistrationSystem', () => {
  it('attaches only this registration’s own submission, and null where there is none', async () => {
    assignmentsRepositoryMock.selectAssignmentsForBatchSystem.mockResolvedValue([
      assignmentRow(),
      assignmentRow({ id: 'assignment-2', title: 'Second piece' }),
    ]);
    assignmentsRepositoryMock.selectSubmissionsForRegistrationSystem.mockResolvedValue([
      submissionRow(),
    ]);

    const result = await getAssignmentsForRegistrationSystem('batch-1', 'registration-1');

    expect(assignmentsRepositoryMock.selectSubmissionsForRegistrationSystem).toHaveBeenCalledWith(
      'registration-1',
      ['assignment-1', 'assignment-2'],
    );
    expect(result[0].mySubmission?.id).toBe('submission-1');
    expect(result[1].mySubmission).toBeNull();
  });

  it('never exposes the R2 object key to the caller', async () => {
    assignmentsRepositoryMock.selectAssignmentsForBatchSystem.mockResolvedValue([assignmentRow()]);
    assignmentsRepositoryMock.selectSubmissionsForRegistrationSystem.mockResolvedValue([
      submissionRow(),
    ]);
    const [assignment] = await getAssignmentsForRegistrationSystem('batch-1', 'registration-1');
    expect(JSON.stringify(assignment)).not.toContain('assignments/assignment-1');
    expect(assignment.mySubmission).not.toHaveProperty('filePath');
  });
});

describe('getAssignmentsForBatchSystem', () => {
  it('counts submissions and reviews per assignment', async () => {
    assignmentsRepositoryMock.selectAssignmentsForBatchSystem.mockResolvedValue([
      assignmentRow(),
      assignmentRow({ id: 'assignment-2' }),
    ]);
    assignmentsRepositoryMock.selectSubmissionsForAssignmentIdsSystem.mockResolvedValue([
      submissionRow({ id: 's1', status: 'reviewed' }),
      submissionRow({ id: 's2', status: 'submitted' }),
      submissionRow({ id: 's3', assignment_id: 'assignment-2', status: 'reviewed' }),
    ]);

    const result = await getAssignmentsForBatchSystem('batch-1');

    expect(result[0]).toMatchObject({ submissionCount: 2, reviewedCount: 1 });
    expect(result[1]).toMatchObject({ submissionCount: 1, reviewedCount: 1 });
  });
});

describe('reviewSubmissionSystem', () => {
  it('marks the submission reviewed and records which tutor did it', async () => {
    assignmentsRepositoryMock.updateSubmissionSystem.mockResolvedValue(
      submissionRow({ status: 'reviewed', grade: 75 }),
    );
    await reviewSubmissionSystem('submission-1', { grade: 75, feedback: 'Good' }, { tutorId: 'tutor-1' });
    expect(assignmentsRepositoryMock.updateSubmissionSystem).toHaveBeenCalledWith(
      'submission-1',
      expect.objectContaining({
        status: 'reviewed',
        grade: 75,
        feedback: 'Good',
        reviewed_by_tutor_id: 'tutor-1',
      }),
    );
  });

  it('normalizes a numeric-string grade coming back from PostgREST', async () => {
    assignmentsRepositoryMock.updateSubmissionSystem.mockResolvedValue(
      submissionRow({ status: 'reviewed', grade: '75.00' }),
    );
    const result = await reviewSubmissionSystem('submission-1', { grade: 75 }, { tutorId: 'tutor-1' });
    expect(result.grade).toBe(75);
  });
});

describe('getSubmissionDownloadUrlSystem', () => {
  it('signs the stored key and returns the owning ids for the caller to authorize against', async () => {
    assignmentsRepositoryMock.selectSubmissionByIdSystem.mockResolvedValue(submissionRow());
    r2ClientMock.getSignedDownloadUrl.mockResolvedValue('https://r2.example/signed');

    const result = await getSubmissionDownloadUrlSystem('submission-1');

    expect(r2ClientMock.getSignedDownloadUrl).toHaveBeenCalledWith(
      'assignments/assignment-1/registration-1/abc.pdf',
    );
    expect(result).toMatchObject({
      url: 'https://r2.example/signed',
      assignmentId: 'assignment-1',
      registrationId: 'registration-1',
    });
  });

  it('404s on an unknown submission rather than signing anything', async () => {
    assignmentsRepositoryMock.selectSubmissionByIdSystem.mockResolvedValue(null);
    await expect(getSubmissionDownloadUrlSystem('nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(r2ClientMock.getSignedDownloadUrl).not.toHaveBeenCalled();
  });
});
