import { beforeEach, describe, expect, it, vi } from 'vitest';

// Finance alerts for MoMo / bank proofs (2026-10-16): each proof emails
// info@knowsia.com once, keyed by the submission; the 07:00 run lists any
// still waiting after 24 hours, keyed by the date. Neither ever throws.

type Sent = { to: string; subject: string; html: string; idempotencyKey: string };
const sendTransactionalEmail = vi.fn(async (_params: Sent) => ({ providerMessageId: 'm1' }));
vi.mock('@/lib/resend/client', () => ({ sendTransactionalEmail }));
const captureToSentry = vi.fn();
vi.mock('@/lib/errors', () => ({ captureToSentry }));
const repo = {
  selectPaymentSubmissionContextSystem: vi.fn(),
  selectPendingPaymentSubmissionsBeforeSystem: vi.fn(),
};
vi.mock('@/modules/payments/repository', () => repo);

const alerts = await import('@/modules/payments/proof-alerts');

const RID = '22222222-2222-4222-8222-222222222222';
const submission = {
  id: 'sub-1', registrationId: RID, method: 'MTN MoMo' as const, amount: 280, transactionReference: 'MP<123>',
  paymentDate: '2026-10-15', hasSlip: true, participantNotes: null, status: 'pending' as const, reviewedAt: null, reviewNote: null,
  createdAt: '2026-10-15T10:00:00Z',
};
const ctx = new Map([[RID, { participantName: 'Ama Mensah', courseName: 'ESG and Sustainability Reporting', cohortLabel: 'Cohort 2' }]]);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PAYMENT_PROOF_ALERT_EMAIL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://knowsia.com';
  repo.selectPaymentSubmissionContextSystem.mockResolvedValue(ctx);
});

describe('a new proof', () => {
  it('emails info@knowsia.com once, with what finance needs and a link to the queue', async () => {
    await alerts.alertFinanceOfPaymentProof(submission);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const sent = sendTransactionalEmail.mock.calls[0][0];
    expect(sent.to).toBe('info@knowsia.com');
    expect(sent.idempotencyKey).toBe('payment_proof_alert:sub-1');
    expect(sent.subject).toBe('Payment to confirm: Ama Mensah · GH₵ 280.00 by MTN MoMo');
    expect(sent.html).toContain('ESG and Sustainability Reporting · Cohort 2');
    expect(sent.html).toContain('https://knowsia.com/payments?view=submissions');
    expect(sent.html).toContain('MP&lt;123&gt;'); // student text is escaped
    expect(sent.html).toContain('attached');
  });

  it('goes to PAYMENT_PROOF_ALERT_EMAIL when set', async () => {
    process.env.PAYMENT_PROOF_ALERT_EMAIL = 'finance@knowsia.com';
    await alerts.alertFinanceOfPaymentProof(submission);
    expect(sendTransactionalEmail.mock.calls[0][0].to).toBe('finance@knowsia.com');
  });

  it('never fails the submission when email is down', async () => {
    sendTransactionalEmail.mockRejectedValueOnce(new Error('resend down'));
    await expect(alerts.alertFinanceOfPaymentProof(submission)).resolves.toBeUndefined();
    expect(captureToSentry).toHaveBeenCalled();
  });
});

describe('the 07:00 reminder', () => {
  const now = new Date('2026-10-17T07:00:00Z');

  it('sends nothing when nothing has waited a day', async () => {
    repo.selectPendingPaymentSubmissionsBeforeSystem.mockResolvedValue([]);
    expect(await alerts.runPendingProofReminder(now)).toEqual({ waiting: 0, sent: false });
    expect(repo.selectPendingPaymentSubmissionsBeforeSystem).toHaveBeenCalledWith('2026-10-16T07:00:00.000Z');
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('lists everything still waiting, once per day', async () => {
    repo.selectPendingPaymentSubmissionsBeforeSystem.mockResolvedValue([
      { id: 'a', registration_id: RID, amount: '280', method: 'MTN MoMo', created_at: '2026-10-15T07:00:00Z' },
      { id: 'b', registration_id: RID, amount: '100', method: 'Bank Transfer', created_at: '2026-10-16T05:00:00Z' },
    ]);
    expect(await alerts.runPendingProofReminder(now)).toEqual({ waiting: 2, sent: true });
    const sent = sendTransactionalEmail.mock.calls[0][0];
    expect(sent.subject).toBe('2 payments still waiting to be confirmed');
    expect(sent.idempotencyKey).toBe('payment_proof_reminder:2026-10-17');
    expect(sent.html).toContain('waiting 2 days');
    expect(sent.html).toContain('waiting 26 hours');
  });
});
