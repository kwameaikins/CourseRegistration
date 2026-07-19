import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectPublicFeedbackContext: vi.fn(),
  selectCourseNames: vi.fn(),
  insertFeedback: vi.fn(),
  selectBatchesEndedOn: vi.fn(),
  selectPaidRegistrationIdsForBatch: vi.fn(),
  selectFeedbackForBatch: vi.fn(),
  countPaidRegistrationsForBatch: vi.fn(),
};
const sendEmailOnceMock = vi.fn();

vi.mock('@/modules/feedback/repository', () => repositoryMock);
vi.mock('@/modules/communications/service', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
}));

const {
  feedbackRequestDateFor,
  runFeedbackRequestDispatch,
  submitFeedback,
} = await import('@/modules/feedback/service');
const { feedbackSubmissionSchema } = await import('@/modules/feedback/types');

function validContext(overrides: Record<string, unknown> = {}) {
  return {
    courseName: 'ESG and Sustainability Reporting',
    cohortLabel: 'JUL 2026',
    participantFirstName: 'Ama',
    participantDeleted: false,
    alreadySubmitted: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMock.selectPublicFeedbackContext.mockResolvedValue(validContext());
  repositoryMock.insertFeedback.mockResolvedValue('inserted');
  sendEmailOnceMock.mockResolvedValue('sent');
});

describe('feedback request timing', () => {
  it('targets batches that ended exactly one day before the run', () => {
    expect(feedbackRequestDateFor(new Date('2026-07-20T07:00:00Z'))).toBe('2026-07-19');
  });
});

describe('runFeedbackRequestDispatch', () => {
  it('sends the post_training_thankyou email to every Paid registration', async () => {
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([{ id: 'batch-1' }]);
    repositoryMock.selectPaidRegistrationIdsForBatch.mockResolvedValue(['reg-1', 'reg-2']);

    const summary = await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(repositoryMock.selectBatchesEndedOn).toHaveBeenCalledWith('2026-07-19');
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'post_training_thankyou');
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-2', 'post_training_thankyou');
    expect(summary.emailsSent).toBe(2);
    expect(summary.errors).toEqual([]);
  });

  it('counts dedup skips instead of re-sending (cron re-run safety)', async () => {
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([{ id: 'batch-1' }]);
    repositoryMock.selectPaidRegistrationIdsForBatch.mockResolvedValue(['reg-1']);
    sendEmailOnceMock.mockResolvedValue('skipped_duplicate');

    const summary = await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(summary.emailsSent).toBe(0);
    expect(summary.skipped).toBe(1);
  });

  it('does nothing when no batch ended yesterday', async () => {
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([]);
    const summary = await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));
    expect(summary.batchesEvaluated).toBe(0);
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
  });
});

describe('submitFeedback', () => {
  const validInput = feedbackSubmissionSchema.parse({
    overallRating: 5,
    facilitatorRating: 4,
    recommendRating: 5,
    improvementText: 'More case studies please.',
    testimonialConsent: true,
    commentsAnonymous: false,
    interestedCourses: ['AI-Powered Financial Reporting and Modeling'],
  });

  it('stores a valid submission with interests joined', async () => {
    await submitFeedback('reg-1', validInput);
    expect(repositoryMock.insertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_id: 'reg-1',
        overall_rating: 5,
        interested_courses: 'AI-Powered Financial Reporting and Modeling',
      }),
    );
  });

  it('rejects a second submission with ALREADY_SUBMITTED', async () => {
    repositoryMock.insertFeedback.mockResolvedValue('duplicate');
    await expect(submitFeedback('reg-1', validInput)).rejects.toMatchObject({
      code: 'ALREADY_SUBMITTED',
      httpStatus: 409,
    });
  });

  it('treats a deleted participant link as invalid (BR-16)', async () => {
    repositoryMock.selectPublicFeedbackContext.mockResolvedValue(
      validContext({ participantDeleted: true }),
    );
    await expect(submitFeedback('reg-1', validInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('schema rejects out-of-range ratings', () => {
    expect(
      feedbackSubmissionSchema.safeParse({
        overallRating: 6,
        facilitatorRating: 4,
        recommendRating: 5,
      }).success,
    ).toBe(false);
  });
});
