import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectCertificates: vi.fn(),
  insertCertificate: vi.fn(),
  selectMaxSerial: vi.fn(),
  selectCertificateById: vi.fn(),
  selectCertificateByNumber: vi.fn(),
  updateCertificate: vi.fn(),
  selectBatchIssueContext: vi.fn(),
};
const sendTransactionalEmailMock = vi.fn();

vi.mock('@/modules/certificates/repository', () => repositoryMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));

const {
  buildCertificateNumber,
  getBatchIssueContext,
  getCertificatePdf,
  issueForBatch,
  issueManual,
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
  repositoryMock.selectMaxSerial.mockResolvedValue(35);
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

  it('continues the serial from the highest existing number', async () => {
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
    expect(repositoryMock.selectMaxSerial).toHaveBeenCalledWith('KNS-AI01-2026-');
    expect(repositoryMock.insertCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificate_number: 'KNS-AI01-2026-0036' }),
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
    expect(repositoryMock.selectMaxSerial).not.toHaveBeenCalled();
  });
});

describe('batch issuance', () => {
  it('marks eligibility as Paid + feedback + not already issued', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      courseCode: 'ESG1',
      courseTitle: 'ESG and Sustainability Reporting',
      candidates: [
        candidate(),
        candidate({ registrationId: 'reg-2', paid: false }),
        candidate({ registrationId: 'reg-3', feedbackSubmitted: false }),
        candidate({ registrationId: 'reg-4', alreadyIssued: true }),
      ],
    });

    const context = await getBatchIssueContext('batch-1');
    const eligibility = Object.fromEntries(
      context!.candidates.map((c) => [c.registrationId, c.eligible]),
    );
    expect(eligibility).toEqual({
      'reg-1': true,
      'reg-2': false,
      'reg-3': false,
      'reg-4': false,
    });
    expect(context!.candidates[0].attendancePercent).toBe(80);
  });

  it('issues and emails selected registrations, skipping already-issued ones', async () => {
    repositoryMock.selectBatchIssueContext.mockResolvedValue({
      courseCode: 'ESG1',
      courseTitle: 'ESG and Sustainability Reporting',
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
  });

  it('refuses to generate a PDF for a revoked certificate', async () => {
    repositoryMock.selectCertificateById.mockResolvedValue({ id: 'cert-1', revoked: true });
    await expect(getCertificatePdf('cert-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
