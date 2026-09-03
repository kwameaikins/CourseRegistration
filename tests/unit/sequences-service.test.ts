import { beforeEach, describe, expect, it, vi } from 'vitest';

const sequencesRepositoryMock = {
  selectSequences: vi.fn(),
  selectSequenceByKey: vi.fn(),
  selectSequenceById: vi.fn(),
  insertSequenceIfMissing: vi.fn(),
  updateSequence: vi.fn(),
  selectSteps: vi.fn(),
  insertStepIfMissing: vi.fn(),
  updateStep: vi.fn(),
  insertEnrollmentIfMissing: vi.fn(),
  selectDueEnrollments: vi.fn(),
  updateEnrollment: vi.fn(),
  stopEnrollmentsForLead: vi.fn(),
  selectEnrollmentCounts: vi.fn(),
  selectRegistrationContact: vi.fn(),
};
const marketingConsentServiceMock = {
  isOptedOut: vi.fn(),
  optedOutSubset: vi.fn(),
  optOut: vi.fn(),
};
const usersServiceMock = { requireRole: vi.fn() };
const sendTransactionalEmailMock = vi.fn();

vi.mock('@/modules/sequences/repository', () => sequencesRepositoryMock);
vi.mock('@/modules/marketing-consent/service', () => marketingConsentServiceMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));

const { enrollLeadSystem, runSequenceDispatch } = await import('@/modules/sequences/service');

const SEQUENCE = {
  id: 'seq-1',
  key: 'lead-nurture',
  name: 'New lead nurture',
  trigger: 'lead_new',
  channel: 'email',
  is_active: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const STEP_1 = {
  id: 'step-1', sequence_id: 'seq-1', step_number: 1, offset_days: 0,
  subject: 'Hello {{first_name}}', body: 'About {{course_name}}.',
  created_at: '', updated_at: '',
};
const STEP_2 = {
  id: 'step-2', sequence_id: 'seq-1', step_number: 2, offset_days: 3,
  subject: 'Still thinking?', body: 'Come back {{first_name}}.',
  created_at: '', updated_at: '',
};

function enrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enr-1', sequence_id: 'seq-1', lead_id: 'lead-1', registration_id: null,
    email: 'ama@example.com', full_name: 'Ama Owusu',
    context: { first_name: 'Ama', course_name: 'Financial Management' },
    next_step: 1, enrolled_at: '2026-09-01T00:00:00Z',
    next_send_at: '2026-09-01T00:00:00Z', status: 'active',
    stopped_reason: null, updated_at: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.UNSUBSCRIBE_SECRET = 'test-secret';
  sequencesRepositoryMock.selectSequences.mockResolvedValue([SEQUENCE]);
  sequencesRepositoryMock.selectSteps.mockResolvedValue([STEP_1, STEP_2]);
  marketingConsentServiceMock.optedOutSubset.mockResolvedValue(new Set());
  sendTransactionalEmailMock.mockResolvedValue({ providerMessageId: 'msg-1' });
});

describe('enrollLeadSystem', () => {
  it('enrolls into the active sequence for the trigger, first step scheduled by offset', async () => {
    await enrollLeadSystem('lead_new', {
      id: 'lead-1', email: 'Ama@Example.com', fullName: 'Ama Owusu',
    });
    expect(sequencesRepositoryMock.insertEnrollmentIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence_id: 'seq-1',
        lead_id: 'lead-1',
        email: 'ama@example.com',
        next_step: 1,
      }),
    );
  });

  it('does nothing when no ACTIVE sequence matches the trigger', async () => {
    sequencesRepositoryMock.selectSequences.mockResolvedValue([
      { ...SEQUENCE, is_active: false },
    ]);
    await enrollLeadSystem('lead_new', {
      id: 'lead-1', email: 'ama@example.com', fullName: 'Ama Owusu',
    });
    expect(sequencesRepositoryMock.insertEnrollmentIfMissing).not.toHaveBeenCalled();
  });
});

describe('runSequenceDispatch', () => {
  it('sends the due step with tokens rendered and an unsubscribe footer, then advances', async () => {
    sequencesRepositoryMock.selectDueEnrollments.mockResolvedValue([enrollment()]);

    const summary = await runSequenceDispatch();

    expect(summary).toMatchObject({ due: 1, sent: 1, completed: 0 });
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ama@example.com',
        subject: 'Hello Ama',
        html: expect.stringContaining('About Financial Management.'),
      }),
    );
    expect(sendTransactionalEmailMock.mock.calls[0][0].html).toContain('/unsubscribe?e=');
    expect(sequencesRepositoryMock.updateEnrollment).toHaveBeenCalledWith(
      'enr-1',
      expect.objectContaining({ next_step: 2 }),
    );
  });

  it('completes an enrollment after its final step', async () => {
    sequencesRepositoryMock.selectDueEnrollments.mockResolvedValue([
      enrollment({ next_step: 2 }),
    ]);

    const summary = await runSequenceDispatch();

    expect(summary).toMatchObject({ sent: 1, completed: 1 });
    expect(sequencesRepositoryMock.updateEnrollment).toHaveBeenCalledWith(
      'enr-1',
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('stops (never emails) an opted-out address', async () => {
    sequencesRepositoryMock.selectDueEnrollments.mockResolvedValue([enrollment()]);
    marketingConsentServiceMock.optedOutSubset.mockResolvedValue(
      new Set(['ama@example.com']),
    );

    const summary = await runSequenceDispatch();

    expect(summary).toMatchObject({ sent: 0, stopped: 1 });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(sequencesRepositoryMock.updateEnrollment).toHaveBeenCalledWith(
      'enr-1',
      expect.objectContaining({ status: 'stopped', stopped_reason: 'opted_out' }),
    );
  });

  it('skips (but keeps) enrollments whose sequence has been switched off', async () => {
    sequencesRepositoryMock.selectSequences.mockResolvedValue([
      { ...SEQUENCE, is_active: false },
    ]);
    sequencesRepositoryMock.selectDueEnrollments.mockResolvedValue([enrollment()]);

    const summary = await runSequenceDispatch();

    expect(summary.sent).toBe(0);
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    // Not stopped either — flipping the sequence back on resumes everyone.
    expect(sequencesRepositoryMock.updateEnrollment).not.toHaveBeenCalled();
  });

  it('isolates a failing send — the row keeps its due date for tomorrow', async () => {
    sequencesRepositoryMock.selectDueEnrollments.mockResolvedValue([
      enrollment(),
      enrollment({ id: 'enr-2', lead_id: 'lead-2', email: 'kwame@example.com' }),
    ]);
    sendTransactionalEmailMock
      .mockRejectedValueOnce(new Error('bounce'))
      .mockResolvedValueOnce({ providerMessageId: 'msg-2' });

    const summary = await runSequenceDispatch();

    expect(summary).toMatchObject({ due: 2, sent: 1, errors: 1 });
  });
});
