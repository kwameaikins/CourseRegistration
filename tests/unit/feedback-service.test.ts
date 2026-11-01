import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectPublicFeedbackContext: vi.fn(),
  insertFeedback: vi.fn(),
  selectBatchesEndedOn: vi.fn(),
  selectPaidRegistrationIdsForBatch: vi.fn(),
  selectAttendedRegistrationIdsForBatch: vi.fn(),
  selectFeedbackForBatch: vi.fn(),
  countPaidRegistrationsForBatch: vi.fn(),
  selectPublishableTestimonialsSystem: vi.fn(),
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
  getPublicFeedbackContext,
  getPublishableTestimonials,
  isPublishableTestimonial,
  getBatchFeedbackSummary,
  runFeedbackRequestDispatch,
  runFeedbackRequestForAttendees,
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

describe('runFeedbackRequestForAttendees', () => {
  beforeEach(() => {
    repositoryMock.selectAttendedRegistrationIdsForBatch.mockResolvedValue(['reg-1', 'reg-2']);
  });

  it('defaults to a dry run and sends nothing', async () => {
    const result = await runFeedbackRequestForAttendees({ batchId: 'batch-1' });
    expect(result.dryRun).toBe(true);
    expect(result.attendedRegistrations).toBe(2);
    expect(result.emailsSent).toBe(0);
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
  });

  it('targets attendees, never the full paid roster', async () => {
    sendEmailOnceMock.mockResolvedValue('sent');
    const result = await runFeedbackRequestForAttendees({ batchId: 'batch-1', dryRun: false });
    expect(repositoryMock.selectPaidRegistrationIdsForBatch).not.toHaveBeenCalled();
    expect(result.emailsSent).toBe(2);
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'post_training_thankyou');
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-2', 'post_training_thankyou');
  });

  it('counts an already-mailed registration as skipped, not sent', async () => {
    sendEmailOnceMock.mockResolvedValueOnce('sent').mockResolvedValueOnce('skipped');
    const result = await runFeedbackRequestForAttendees({ batchId: 'batch-1', dryRun: false });
    expect(result.emailsSent).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('one failure never stops the rest of the send', async () => {
    sendEmailOnceMock
      .mockRejectedValueOnce(new Error('resend exploded'))
      .mockResolvedValueOnce('sent');
    const result = await runFeedbackRequestForAttendees({ batchId: 'batch-1', dryRun: false });
    expect(result.errors).toHaveLength(1);
    expect(result.emailsSent).toBe(1);
  });
});

describe('runFeedbackRequestDispatch', () => {
  it('sends the post_training_thankyou email to every Paid registration', async () => {
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([{ id: 'batch-1', is_free: false }]);
    repositoryMock.selectPaidRegistrationIdsForBatch.mockResolvedValue(['reg-1', 'reg-2']);

    const summary = await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(repositoryMock.selectBatchesEndedOn).toHaveBeenCalledWith('2026-07-19');
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'post_training_thankyou');
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-2', 'post_training_thankyou');
    expect(summary.emailsSent).toBe(2);
    expect(summary.errors).toEqual([]);
  });

  // On a free Batch every registration auto-settles to Paid, so paid-targeting
  // would mail the certificate-for-feedback promise to people who never joined.
  it('targets ATTENDEES on a free Batch, not the paid roster', async () => {
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([{ id: 'batch-free', is_free: true }]);
    repositoryMock.selectAttendedRegistrationIdsForBatch.mockResolvedValue(['reg-attended']);

    const summary = await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(repositoryMock.selectAttendedRegistrationIdsForBatch).toHaveBeenCalledWith('batch-free');
    expect(repositoryMock.selectPaidRegistrationIdsForBatch).not.toHaveBeenCalled();
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-attended', 'post_training_thankyou');
    expect(summary.emailsSent).toBe(1);
  });

  // Attendance can legitimately be empty on a paid Batch; a paid participant
  // earns their certificate whether or not the Zoom sync saw them.
  it('never gates a paid Batch on attendance', async () => {
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([{ id: 'batch-paid', is_free: false }]);
    repositoryMock.selectPaidRegistrationIdsForBatch.mockResolvedValue(['reg-1']);
    repositoryMock.selectAttendedRegistrationIdsForBatch.mockResolvedValue([]);

    const summary = await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(repositoryMock.selectAttendedRegistrationIdsForBatch).not.toHaveBeenCalled();
    expect(summary.emailsSent).toBe(1);
  });

  it('counts dedup skips instead of re-sending (cron re-run safety)', async () => {
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([{ id: 'batch-1', is_free: false }]);
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

// Consent alone was never enough to make an answer worth quoting. A real
// participant answered "what was most valuable?" with "NA", consented to
// publication, and it rendered as a testimonial on the live home page.
describe('isPublishableTestimonial', () => {
  const good = {
    quote: 'I learnt that ESG is the future, and how it applies to financial reporting.',
    overallRating: 5,
  };

  it('publishes a substantial, well-rated answer', () => {
    expect(isPublishableTestimonial(good)).toBe(true);
  });

  it('rejects the placeholder answers people actually type', () => {
    for (const quote of ['NA', 'N/A', 'n/a', 'None', 'nil', 'Nothing', '-', '...', '  NA  ']) {
      expect(isPublishableTestimonial({ quote, overallRating: 5 })).toBe(false);
    }
  });

  it('rejects fragments too short to read as a testimonial', () => {
    expect(isPublishableTestimonial({ quote: 'The reporting frameworks', overallRating: 5 })).toBe(
      false,
    );
    expect(isPublishableTestimonial({ quote: 'Building the ERM Register', overallRating: 5 })).toBe(
      false,
    );
  });

  // Quoting a two-star review as marketing is both odd and a little dishonest.
  it('rejects a well-written answer attached to a poor rating', () => {
    expect(isPublishableTestimonial({ ...good, overallRating: 3 })).toBe(false);
    expect(isPublishableTestimonial({ ...good, overallRating: 2 })).toBe(false);
  });

  // The placeholder pattern is anchored precisely so this survives.
  it('does not reject a real testimonial that merely begins with a placeholder word', () => {
    expect(
      isPublishableTestimonial({
        quote: 'No other course has explained sustainability reporting this clearly to me.',
        overallRating: 5,
      }),
    ).toBe(true);
  });
});

describe('getPublishableTestimonials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops junk and puts named quotes first', async () => {
    repositoryMock.selectPublishableTestimonialsSystem.mockResolvedValue([
      { quote: 'NA', attributedName: null, courseName: 'ERM', overallRating: 5 },
      {
        quote: 'The entire presentation was exceptionally helpful and well paced.',
        attributedName: null,
        courseName: 'ESG',
        overallRating: 5,
      },
      {
        quote: 'Regulated entities must report on sustainability from 2027 onwards.',
        attributedName: 'Ama Boateng',
        courseName: 'ESG',
        overallRating: 5,
      },
    ]);

    const testimonials = await getPublishableTestimonials(6);

    expect(testimonials.map((t) => t.attributedName)).toEqual(['Ama Boateng', null]);
    expect(testimonials.some((t) => t.quote === 'NA')).toBe(false);
  });

  // An 'Anonymous' row is someone who consented to publication but declined
  // attribution. It stays publishable, and stays unnamed.
  it('still publishes consented anonymous quotes, without inventing a name', async () => {
    repositoryMock.selectPublishableTestimonialsSystem.mockResolvedValue([
      {
        quote: 'Understanding the importance of S1 and S2 in financial reporting.',
        attributedName: null,
        courseName: 'ESG',
        overallRating: 5,
      },
    ]);

    const [testimonial] = await getPublishableTestimonials(6);

    expect(testimonial.attributedName).toBeNull();
    expect(testimonial.quote).toContain('S1 and S2');
  });

  it('asks for more candidates than it needs, since most rules reject', async () => {
    repositoryMock.selectPublishableTestimonialsSystem.mockResolvedValue([]);
    await getPublishableTestimonials(3);
    expect(repositoryMock.selectPublishableTestimonialsSystem).toHaveBeenCalledWith(60);
  });
});

describe('NPS on the batch summary (Revenue OS Phase 2)', () => {
  function summaryRow(overrides: Record<string, unknown> = {}) {
    return {
      registration_id: 'reg-1',
      participant_name: 'Ama',
      overall_rating: 5,
      relevance_rating: 5,
      facilitator_rating: 5,
      confidence_rating: 5,
      materials_clarity: 'Yes',
      most_valuable_text: null,
      improvement_text: null,
      recommendation: 'Yes',
      other_course_suggestion: null,
      testimonial_choice: 'No',
      submitted_at: '2026-09-01T00:00:00Z',
      nps_score: null,
      ...overrides,
    };
  }

  it('computes %promoters − %detractors over ANSWERED responses only', async () => {
    repositoryMock.selectFeedbackForBatch.mockResolvedValue([
      summaryRow({ registration_id: 'r1', nps_score: 10 }), // promoter
      summaryRow({ registration_id: 'r2', nps_score: 3 }), // detractor
      summaryRow({ registration_id: 'r3', nps_score: 8 }), // passive
      summaryRow({ registration_id: 'r4' }), // did not answer — excluded
    ]);
    repositoryMock.countPaidRegistrationsForBatch.mockResolvedValue(10);

    const summary = await getBatchFeedbackSummary('batch-1');

    expect(summary.npsResponses).toBe(3);
    // (1 promoter − 1 detractor) / 3 answers → 0%.
    expect(summary.nps).toBe(0);
  });

  it('reports null rather than a fake 0 when nobody answered the question', async () => {
    repositoryMock.selectFeedbackForBatch.mockResolvedValue([summaryRow()]);
    repositoryMock.countPaidRegistrationsForBatch.mockResolvedValue(10);

    const summary = await getBatchFeedbackSummary('batch-1');

    expect(summary.nps).toBeNull();
    expect(summary.npsResponses).toBe(0);
  });
});


describe('CERTIFICATE_ELIGIBILITY=lms (feedback moved to the LMS)', () => {
  const fetchMock = vi.fn();
  const jsonRes = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const input = feedbackSubmissionSchema.parse({
    overallRating: 5, relevanceRating: 5, facilitatorRating: 5, confidenceRating: 4,
    materialsClarity: 'Yes', recommendation: 'Yes',
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.KNOWSIA_LMS_API_URL = 'https://lms.test';
    process.env.KNOWSIA_APP_SERVICE_KEY = 'k';
    process.env.CERTIFICATE_ELIGIBILITY = 'lms';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CERTIFICATE_ELIGIBILITY;
  });

  it('submit posts to the LMS door and never touches the local repository', async () => {
    fetchMock.mockResolvedValue(jsonRes(201, { id: 'f1' }));
    const result = await submitFeedback('reg-1', input);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://lms.test/api/v1/service/lms/feedback/reg-1');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ overallRating: 5, recommendation: 'Yes' });
    expect(repositoryMock.insertFeedback).not.toHaveBeenCalled();
    expect(certificatesServiceMock.issueCertificateIfEligible).not.toHaveBeenCalled();
    expect(result.certificateIssued).toBe(false);
  });

  it('an LMS 404 is the not-valid page, not a throw of another kind', async () => {
    fetchMock.mockResolvedValue(jsonRes(404, { detail: 'feedback_link_not_valid' }));
    await expect(submitFeedback('reg-1', input)).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
    await expect(getPublicFeedbackContext('reg-1')).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
  });

  it('an LMS 409 is ALREADY_SUBMITTED', async () => {
    fetchMock.mockResolvedValue(jsonRes(409, { detail: 'feedback_exists' }));
    await expect(submitFeedback('reg-1', input)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED', httpStatus: 409 });
  });

  it('the public context is read from the LMS', async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { courseTitle: 'ESG 1', participantName: 'Ama Owusu', submitted: true }));
    const ctx = await getPublicFeedbackContext('reg-1');
    expect(ctx).toMatchObject({ courseName: 'ESG 1', participantFirstName: 'Ama', alreadySubmitted: true });
    expect(repositoryMock.selectPublicFeedbackContext).not.toHaveBeenCalled();
  });

  it('the daily dispatch sends nothing and reports delegated', async () => {
    const summary = await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));
    expect(summary.delegated).toBe('lms');
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
    expect(repositoryMock.selectBatchesEndedOn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('summary and testimonials read the LMS', async () => {
    const lmsSummary = { responses: 2, paidRegistrations: 3, rows: [] };
    fetchMock.mockResolvedValueOnce(jsonRes(200, lmsSummary));
    expect(await getBatchFeedbackSummary('batch-1')).toEqual(lmsSummary);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://lms.test/api/v1/service/lms/cohorts/batch-1/feedback/summary');
    fetchMock.mockResolvedValueOnce(jsonRes(200, [
      { quote: 'x'.repeat(50), attributedName: null, courseName: 'ESG', overallRating: 5 },
    ]));
    const t = await getPublishableTestimonials(3);
    expect(t).toHaveLength(1);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v1/service/lms/testimonials?');
    expect(repositoryMock.selectFeedbackForBatch).not.toHaveBeenCalled();
  });

  it('local mode (the default) makes no fetch', async () => {
    delete process.env.CERTIFICATE_ELIGIBILITY;
    repositoryMock.selectBatchesEndedOn.mockResolvedValue([]);
    await submitFeedback('reg-1', input);
    await runFeedbackRequestDispatch(new Date('2026-07-20T07:00:00Z'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});