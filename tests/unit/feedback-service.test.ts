import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectPublicFeedbackContext: vi.fn(),
  insertFeedback: vi.fn(),
  selectBatchesEndedOn: vi.fn(),
  selectPaidRegistrationIdsForBatch: vi.fn(),
  selectFeedbackForBatch: vi.fn(),
  countPaidRegistrationsForBatch: vi.fn(),
};
const sendEmailOnceMock = vi.fn();
const certificatesServiceMock = {
  issueCertificateIfEligible: vi.fn(),
  downloadUrlFor: vi.fn(),
};

vi.mock('@/modules/feedback/repository', () => repositoryMock);
vi.mock('@/modules/communications/service', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
}));
vi.mock('@/modules/certificates/service', () => certificatesServiceMock);

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
  certificatesServiceMock.issueCertificateIfEligible.mockResolvedValue(null);
  certificatesServiceMock.downloadUrlFor.mockImplementation(
    (id: string) => `https://reg.knowsia.com/api/certificates/download/${id}`,
  );
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
    relevanceRating: 4,
    facilitatorRating: 4,
    confidenceRating: 5,
    materialsClarity: 'Yes',
    mostValuableText: 'The live case study walkthrough.',
    improvementText: 'More case studies please.',
    recommendation: 'Yes',
    otherCourseSuggestion: 'Advanced Excel Modeling',
    testimonialChoice: 'Named',
  });

  it('stores a valid submission with the new fields', async () => {
    await submitFeedback('reg-1', validInput);
    expect(repositoryMock.insertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_id: 'reg-1',
        overall_rating: 5,
        relevance_rating: 4,
        confidence_rating: 5,
        materials_clarity: 'Yes',
        most_valuable_text: 'The live case study walkthrough.',
        recommendation: 'Yes',
        other_course_suggestion: 'Advanced Excel Modeling',
        testimonial_choice: 'Named',
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
        relevanceRating: 4,
        facilitatorRating: 4,
        confidenceRating: 5,
        materialsClarity: 'Yes',
        recommendation: 'Yes',
      }).success,
    ).toBe(false);
  });

  describe('certificate auto-issue (founder-approved 2026-07-27)', () => {
    it('reports the issued certificate and its download url', async () => {
      certificatesServiceMock.issueCertificateIfEligible.mockResolvedValue({ id: 'cert-1' });

      const result = await submitFeedback('reg-1', validInput);

      expect(certificatesServiceMock.issueCertificateIfEligible).toHaveBeenCalledWith('reg-1');
      expect(result).toEqual({
        certificateIssued: true,
        certificateDownloadUrl: 'https://reg.knowsia.com/api/certificates/download/cert-1',
      });
    });

    it('reports not-issued when the registration is not eligible yet', async () => {
      certificatesServiceMock.issueCertificateIfEligible.mockResolvedValue(null);

      const result = await submitFeedback('reg-1', validInput);

      expect(result).toEqual({ certificateIssued: false, certificateDownloadUrl: null });
    });

    it('never fails the feedback submission if certificate issuance throws', async () => {
      certificatesServiceMock.issueCertificateIfEligible.mockRejectedValue(new Error('db down'));

      const result = await submitFeedback('reg-1', validInput);

      expect(repositoryMock.insertFeedback).toHaveBeenCalled();
      expect(result).toEqual({ certificateIssued: false, certificateDownloadUrl: null });
    });
  });
});
