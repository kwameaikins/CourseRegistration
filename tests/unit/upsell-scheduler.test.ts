import { beforeEach, describe, expect, it, vi } from 'vitest';

const voiceServiceMock = {
  getUpsellCandidates: vi.fn(),
};
const sendEmailOnceMock = vi.fn();
const sendWhatsappOnceMock = vi.fn();
const sendSmsOnceMock = vi.fn();

vi.mock('@/modules/voice/service', () => voiceServiceMock);
vi.mock('@/modules/communications/email-engine', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
}));
vi.mock('@/modules/communications/whatsapp-engine', () => ({
  sendWhatsappOnce: (...args: unknown[]) => sendWhatsappOnceMock(...args),
}));
vi.mock('@/modules/communications/sms-engine', () => ({
  sendSmsOnce: (...args: unknown[]) => sendSmsOnceMock(...args),
}));

const { runUpsellMessageDispatch } = await import('@/modules/communications/upsell-scheduler');

const NOW = new Date('2026-07-10T07:00:00Z');

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    registrationId: 'reg-1',
    pitchCourseName: 'AI-Powered Financial Reporting',
    pitchCohortLabel: 'SEP-2026',
    pitchStartDate: '2026-09-07',
    pitchFee: 800,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendEmailOnceMock.mockResolvedValue('sent');
  sendWhatsappOnceMock.mockResolvedValue('sent');
  sendSmsOnceMock.mockResolvedValue('sent');
});

describe('runUpsellMessageDispatch', () => {
  it('sends the pitch on all 3 channels with the candidate details as extra placeholders', async () => {
    voiceServiceMock.getUpsellCandidates.mockResolvedValue([candidate()]);

    const summary = await runUpsellMessageDispatch(NOW);

    const expectedExtra = {
      pitch_course_name: 'AI-Powered Financial Reporting',
      pitch_cohort_label: 'SEP-2026',
      pitch_start_date: '2026-09-07',
      pitch_fee: 'GHS 800.00',
    };
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'upsell', expectedExtra);
    expect(sendWhatsappOnceMock).toHaveBeenCalledWith('reg-1', 'upsell', expectedExtra);
    expect(sendSmsOnceMock).toHaveBeenCalledWith('reg-1', 'upsell', expectedExtra);
    expect(summary).toMatchObject({ evaluated: 1, sent: 1, whatsappSent: 1, smsSent: 1 });
  });

  it('queries candidates using today\'s date', async () => {
    voiceServiceMock.getUpsellCandidates.mockResolvedValue([]);

    await runUpsellMessageDispatch(NOW);

    expect(voiceServiceMock.getUpsellCandidates).toHaveBeenCalledWith('2026-07-10');
  });

  it('counts a deduplicated email skip separately from a successful whatsapp/sms send', async () => {
    voiceServiceMock.getUpsellCandidates.mockResolvedValue([candidate()]);
    sendEmailOnceMock.mockResolvedValue('skipped_duplicate');

    const summary = await runUpsellMessageDispatch(NOW);

    expect(summary.skippedDeduplicated).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.whatsappSent).toBe(1);
  });

  it('records a failed send in errors without stopping other candidates', async () => {
    voiceServiceMock.getUpsellCandidates.mockResolvedValue([
      candidate({ registrationId: 'reg-1' }),
      candidate({ registrationId: 'reg-2' }),
    ]);
    sendEmailOnceMock
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('sent');

    const summary = await runUpsellMessageDispatch(NOW);

    expect(summary.errors).toEqual(['reg-1/upsell: send failed']);
    expect(summary.sent).toBe(1);
    expect(summary.evaluated).toBe(2);
  });

  it('does nothing when there are no candidates', async () => {
    voiceServiceMock.getUpsellCandidates.mockResolvedValue([]);

    const summary = await runUpsellMessageDispatch(NOW);

    expect(summary.evaluated).toBe(0);
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
  });
});
