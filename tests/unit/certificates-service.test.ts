import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectCertificates: vi.fn(),
  insertCertificate: vi.fn(),
  selectMaxSerialForCourseYear: vi.fn(),
  selectCourseSerialFloor: vi.fn(),
  selectCertificateById: vi.fn(),
  selectCertificateByNumber: vi.fn(),
  updateCertificate: vi.fn(),
  selectBatchIssueContext: vi.fn(),
  selectBatchIdForRegistration: vi.fn(),
};
const sendTransactionalEmailMock = vi.fn();
// The staff-facing certificate actions gate on requireRole; mocking the users
// service keeps these tests off lib/supabase (and out of a request scope).
const usersServiceMock = { requireRole: vi.fn() };

vi.mock('@/modules/certificates/repository', () => repositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));

const {
  buildCertificateNumber,
  getBatchIssueContextSystem,
  getCertificatePdf,
  issueCertificateIfEligible,
  issueForBatch,
  issueManual,
  listCertificates,
  resendCertificateEmail,
  revokeCertificate,
  verifyCertificate,
} = await import('@/modules/certificates/service');

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    registrationId: 'reg-1',
    participantName: 'Ama Owusu',
    participantEmail: 'ama@example.com',
    participantDeleted: false,
    paid: true,
    feedbackSubmitted: true,
    attendedSessions: 4,
    totalSessions: 5,
    alreadyIssued: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
  repositoryMock.selectMaxSerialForCourseYear.mockResolvedValue(35);
  repositoryMock.selectCourseSerialFloor.mockResolvedValue(0);
  repositoryMock.insertCertificate.mockImplementation(async (row) => ({
    outcome: 'inserted',
    row: {
      id: 'cert-1',
      revoked: false,
      revoked_reason: null,
      created_at: '2026-07-19T00:00:00Z',
      registration_id: null,
      issued_by: 'staff-1',
      recipient_email: null,
      ...row,
    },
  }));
  sendTransactionalEmailMock.mockResolvedValue(undefined);
});

describe('certificate numbering', () => {
  it('uses the KNS-<CODE>-<YEAR>-<NNNN> format', () => {
    expect(buildCertificateNumber('ai01', 2026, 36)).toBe('KNS-AI01-2026-0036');
  });

  it('continues the serial across prefixes — after legacy KNW-…-0065 comes KNS-…-0066', async () => {
    repositoryMock.selectMaxSerialForCourseYear.mockResolvedValue(65);
    await issueManual(
      {
        recipientName: 'Nicholina Nyumutei',
        courseCode: 'AI01',
        courseTitle: 'AI for Business Productivity',
        description: '',
        hours: 20,
        cpdCredit: 'TBD',
        issuedDate: '2026-07-19',
        sendEmail: false,
      },
      'staff-1',
    );
    expect(repositoryMock.selectMaxSerialForCourseYear).toHaveBeenCalledWith('AI01', 2026);
    expect(repositoryMock.insertCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificate_number: 'KNS-AI01-2026-0066' }),
    );
  });

  it('respects the legacy AppScript counter as a serial floor (CA01 case)', async () => {
    // Registry export has no CA01 rows, but the counter says 20 were issued.
    repositoryMock.selectMaxSerialForCourseYear.mockResolvedValue(0);
    repositoryMock.selectCourseSerialFloor.mockResolvedValue(20);
    await issueManual(
      {
        recipientName: 'Ama Owusu',
        courseCode: 'CA01',
        courseTitle: 'Practical Accounting with Sage 50',
        description: '',
        hours: 10,
        cpdCredit: 'TBD',
        issuedDate: '2026-07-20',
        sendEmail: false,
      },
      'staff-1',
    );
    expect(repositoryMock.insertCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificate_number: 'KNS-CA01-2026-0021' }),
    );
  });

  it('honours a custom number for legacy backfill', async () => {
    await issueManual(
      {
        recipientName: 'Nicholina Nyumutei',
        courseCode: 'AI01',
        courseTitle: 'AI for Business Productivity',
        description: '',
        hours: 20,
        cpdCredit: 'TBD',
        issuedDate: '2026-06-14',
        customNumber: 'KNW-AI01-2026-0036',
        sendEmail: false,
      },
      'staff-1',
    );
    expect(repositoryMock.insertCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificate_number: 'KNW-AI01-2026-0036' }),
    );
    expect(repositoryMock.selectMaxSerialForCourseYear).not.toHaveBeenCalled();
  });
});

describe('batch issuance', () => {
  // Revised 2026-08-18 (founder): on a paid Batch, payment is the WHOLE rule.
  // Feedback used to be a second condition; withholding something already paid
  // for until a survey is filled in is a hostage, not an incentive.
  it('marks eligibility as Paid + not already issued, regardless of feedback', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      courseCode: 'ESG1',
      courseTitle: 'ESG and Sustainability Reporting',
      batchIsFree: false,
      candidates: [
        candidate(),
        candidate({ registrationId: 'reg-2', paid: false }),
        candidate({ registrationId: 'reg-3', feedbackSubmitted: false }),
        candidate({ registrationId: 'reg-4', alreadyIssued: true }),
      ],
    });

    const context = await getBatchIssueContextSystem('batch-1');
    const eligibility = Object.fromEntries(
      context!.candidates.map((c) => [c.registrationId, c.eligible]),
    );
    expect(eligibility).toEqual({
      'reg-1': true,
      'reg-2': false,
      // Paid but no feedback — eligible now, where it was not before.
      'reg-3': true,
      'reg-4': false,
    });
    expect(context!.candidates[0].attendancePercent).toBe(80);
  });

  // Free events: a zero-fee registration settles to 'Paid' the instant it is
  // created, so `paid` is true for everyone who merely filled in the form.
  // Participation has to be proved some other way, and since 2026-08-18 either
  // signal suffices — they turned up, or they told us what they thought.
  it('accepts attendance OR feedback on a free batch, and neither is not enough', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      courseCode: 'ESG1',
      courseTitle: 'ESG and Sustainability Reporting',
      batchIsFree: true,
      candidates: [
        // Attended and gave feedback.
        candidate(),
        // Never attended, but gave feedback — qualifies on the feedback arm.
        candidate({ registrationId: 'reg-2', attendedSessions: 0 }),
        // Attended, no feedback — qualifies on the attendance arm.
        candidate({ registrationId: 'reg-3', feedbackSubmitted: false }),
        // Signed up and did nothing else. Still must NOT qualify, which is the
        // whole reason payment cannot be the gate on a free batch.
        candidate({
          registrationId: 'reg-4',
          attendedSessions: 0,
          feedbackSubmitted: false,
        }),
      ],
    });

    const context = await getBatchIssueContextSystem('batch-1');
    const eligibility = Object.fromEntries(
      context!.candidates.map((c) => [c.registrationId, c.eligible]),
    );
    expect(eligibility).toEqual({
      'reg-1': true,
      'reg-2': true,
      'reg-3': true,
      'reg-4': false,
    });
  });

  it('still ignores attendance on a paid batch, where payment is the gate', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      courseCode: 'ESG1',
      courseTitle: 'ESG and Sustainability Reporting',
      batchIsFree: false,
      candidates: [candidate({ attendedSessions: 0 })],
    });

    const context = await getBatchIssueContextSystem('batch-1');
    expect(context!.candidates[0].eligible).toBe(true);
  });

  it('issues and emails selected registrations, skipping already-issued ones', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      courseCode: 'ESG1',
      courseTitle: 'ESG and Sustainability Reporting',
      batchIsFree: false,
      candidates: [candidate(), candidate({ registrationId: 'reg-4', alreadyIssued: true })],
    });

    const result = await issueForBatch(
      {
        batchId: '4c9f6ae2-0000-4000-8000-000000000001',
        registrationIds: ['reg-1', 'reg-4'],
        hours: 20,
        description: 'focused on ESG reporting.',
        cpdCredit: 'TBD',
        sendEmail: true,
      },
      'staff-1',
    );

    expect(result.issued).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.emailed).toBe(1);
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ama@example.com' }),
    );
  });
});

describe('resendCertificateEmail', () => {
  function certRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cert-1',
      certificate_number: 'KNS-AI01-2026-0036',
      recipient_name: 'Nicholina Nyumutei',
      course_title: 'AI for Business Productivity',
      recipient_email: 'nicholina@example.com',
      revoked: false,
      ...overrides,
    };
  }

  it('sends via the existing certificate-email logic and reports success', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue(certRow());

    const sent = await resendCertificateEmail('cert-1');

    expect(sent).toBe(true);
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'nicholina@example.com' }),
    );
  });

  it('returns false with no email on file, without throwing', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue(certRow({ recipient_email: null }));

    const sent = await resendCertificateEmail('cert-1');

    expect(sent).toBe(false);
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for a missing certificate', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue(null);
    await expect(resendCertificateEmail('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses to resend a revoked certificate', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue(certRow({ revoked: true }));
    await expect(resendCertificateEmail('cert-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });
});

describe('issueCertificateIfEligible — feedback auto-issue (2026-07-27)', () => {
  function batchIssueContext(overrides: Record<string, unknown> = {}) {
    return {
      courseCode: 'ESG1',
      courseTitle: 'ESG and Sustainability Reporting',
      defaultHours: 20,
      defaultDescription: 'focused on ESG reporting.',
      defaultCpdCredit: 'TBD',
      batchIsFree: false,
      candidates: [candidate()],
      ...overrides,
    };
  }

  beforeEach(() => {
    repositoryMock.selectBatchIdForRegistration.mockResolvedValue('batch-1');
    repositoryMock.selectBatchIssueContext.mockResolvedValue(batchIssueContext());
  });

  // CHANGED 2026-08-18. This used to assert the opposite — no auto-issue on a
  // free batch until attendance was recorded. Under "attended OR gave
  // feedback" that guard is gone by design: this path only ever runs because
  // feedback was just submitted, so the feedback arm is satisfied by
  // definition. Someone who never attended but did tell us what they thought
  // now gets their certificate.
  it('auto-issues on a free batch from feedback alone, with no attendance recorded', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(
      batchIssueContext({
        batchIsFree: true,
        candidates: [candidate({ attendedSessions: 0 })],
      }),
    );

    expect(await issueCertificateIfEligible('reg-1')).not.toBeNull();
    expect(repositoryMock.insertCertificate).toHaveBeenCalled();
  });

  // The one thing a free batch still refuses: no attendance and no feedback.
  // Not reachable through the feedback trigger itself, but it is the rule, and
  // the batch-issue screen shares this exact function.
  it('does not issue on a free batch with neither attendance nor feedback', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(
      batchIssueContext({
        batchIsFree: true,
        candidates: [candidate({ attendedSessions: 0, feedbackSubmitted: false })],
      }),
    );

    expect(await issueCertificateIfEligible('reg-1')).toBeNull();
    expect(repositoryMock.insertCertificate).not.toHaveBeenCalled();
  });

  // Paid batch: payment is the whole rule, so a paid registration with no
  // feedback is eligible. It simply has no automatic trigger to deliver it —
  // the admin batch-issue screen is the route for those.
  it('issues on a paid batch even when feedback was never submitted', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(
      batchIssueContext({ candidates: [candidate({ feedbackSubmitted: false })] }),
    );

    expect(await issueCertificateIfEligible('reg-1')).not.toBeNull();
  });

  it('issues a certificate with issued_by null when Paid', async () => {
    const result = await issueCertificateIfEligible('reg-1');

    expect(result).not.toBeNull();
    expect(repositoryMock.insertCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ registration_id: 'reg-1', issued_by: null }),
    );
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ama@example.com' }),
    );
  });

  it('returns null when the registration has no batch', async () => {
    repositoryMock.selectBatchIdForRegistration.mockResolvedValue(null);
    expect(await issueCertificateIfEligible('reg-missing')).toBeNull();
    expect(repositoryMock.insertCertificate).not.toHaveBeenCalled();
  });

  it('returns null when not Paid', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(
      batchIssueContext({ candidates: [candidate({ paid: false })] }),
    );
    expect(await issueCertificateIfEligible('reg-1')).toBeNull();
    expect(repositoryMock.insertCertificate).not.toHaveBeenCalled();
  });

  it('returns null when already issued', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(
      batchIssueContext({ candidates: [candidate({ alreadyIssued: true })] }),
    );
    expect(await issueCertificateIfEligible('reg-1')).toBeNull();
    expect(repositoryMock.insertCertificate).not.toHaveBeenCalled();
  });

  it('returns null for a deleted participant', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(
      batchIssueContext({ candidates: [candidate({ participantDeleted: true })] }),
    );
    expect(await issueCertificateIfEligible('reg-1')).toBeNull();
  });
});

describe('verification and download', () => {
  it('reports a valid certificate with its public fields only', async () => {
    repositoryMock.selectCertificateByNumber.mockResolvedValue({
      certificate_number: 'KNS-AI01-2026-0036',
      recipient_name: 'Nicholina Nyumutei',
      course_title: 'AI for Business Productivity',
      issued_date: '2026-06-14',
      revoked: false,
    });
    const result = await verifyCertificate('KNS-AI01-2026-0036');
    expect(result.status).toBe('valid');
    expect(result.recipientName).toBe('Nicholina Nyumutei');
  });

  it('reports revoked certificates as revoked, not missing', async () => {
    repositoryMock.selectCertificateByNumber.mockResolvedValue({
      certificate_number: 'KNS-AI01-2026-0036',
      revoked: true,
    });
    const result = await verifyCertificate('KNS-AI01-2026-0036');
    expect(result.status).toBe('revoked');
  });

  it('generates a PDF for a valid certificate', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue({
      id: 'cert-1',
      certificate_number: 'KNS-AI01-2026-0036',
      recipient_name: 'Nicholina Nyumutei',
      course_title: 'AI for Business Productivity',
      description: 'focused on practical application of AI tools.',
      hours: 20,
      cpd_credit: 'TBD',
      issued_date: '2026-06-14',
      revoked: false,
    });
    const { fileName, bytes } = await getCertificatePdf('cert-1');
    expect(fileName).toBe('KNS-AI01-2026-0036.pdf');
    // %PDF magic bytes prove a real document was produced.
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF');
    const pdfContents = Buffer.from(bytes).toString('latin1');
    // Logo, QR code, and both handwritten signatory signatures are embedded
    // (>= 4 image objects; alpha channels may add SMask image objects, so an
    // exact count would be brittle across encoders).
    expect((pdfContents.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('refuses to generate a PDF for a revoked certificate', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue({ id: 'cert-1', revoked: true });
    await expect(getCertificatePdf('cert-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('authorization — the staff-facing certificate actions', () => {
  // These run on the service-role client, which bypasses RLS, so the
  // requireRole call in the service is the only thing standing between a
  // non-admin caller and the data.
  it('restricts listing to admin', async () => {
    repositoryMock.selectCertificates.mockResolvedValue([]);
    await listCertificates();
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('restricts manual issuance to admin', async () => {
    await issueManual(
      {
        recipientName: 'Ama Owusu',
        courseTitle: 'AI Reporting',
        courseCode: 'AI05',
        description: '',
        hours: 20,
        cpdCredit: 'TBD',
        issuedDate: '2026-08-07',
        sendEmail: false,
      },
      'staff-1',
    );
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('restricts batch issuance to admin', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue(null);
    await expect(
      issueForBatch(
        {
          batchId: 'batch-1',
          registrationIds: [],
          description: '',
          hours: 20,
          cpdCredit: 'TBD',
          sendEmail: false,
        },
        'staff-1',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('restricts revocation to admin', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue({ id: 'cert-1' });
    await revokeCertificate('cert-1', 'issued in error');
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('restricts resending to admin', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue({
      id: 'cert-1',
      revoked: false,
      recipient_email: null,
    });
    await resendCertificateEmail('cert-1');
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  // Public verification and the emailed download link must keep working for
  // people who have no staff session at all.
  it('leaves public verification ungated', async () => {
    repositoryMock.selectCertificateByNumber.mockResolvedValue(null);
    await expect(verifyCertificate('KNS-2026-0001')).resolves.toEqual({ status: 'not_found' });
    expect(usersServiceMock.requireRole).not.toHaveBeenCalled();
  });
});
