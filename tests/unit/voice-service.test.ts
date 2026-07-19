import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectCallContexts: vi.fn(),
  selectPaymentFollowupRegistrations: vi.fn(),
  selectBankTransferChaseRegistrations: vi.fn(),
  selectNoShowRegistrations: vi.fn(),
  selectFeedbackVoiceRegistrations: vi.fn(),
  selectUpsellCandidates: vi.fn(),
  reserveCallSlot: vi.fn(),
  updateCallLog: vi.fn(),
  selectCallLogByVapiId: vi.fn(),
  insertInboundCallLog: vi.fn(),
  selectRecentCalls: vi.fn(),
};
const clientMock = {
  isVoiceConfigured: vi.fn(),
  startOutboundCall: vi.fn(),
};
const submitFeedbackMock = vi.fn();

vi.mock('@/modules/voice/repository', () => repositoryMock);
vi.mock('@/lib/vapi/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/vapi/client')>('@/lib/vapi/client');
  return {
    normalizeCallPhone: actual.normalizeCallPhone,
    isVoiceConfigured: () => clientMock.isVoiceConfigured(),
    startOutboundCall: (...args: unknown[]) => clientMock.startOutboundCall(...args),
    isValidVapiSecret: actual.isValidVapiSecret,
  };
});
vi.mock('@/modules/feedback/service', () => ({
  submitFeedback: (...args: unknown[]) => submitFeedbackMock(...args),
}));

const { callingWindowStart, handleEndOfCallReport, runVoiceCallDispatch } = await import(
  '@/modules/voice/service'
);

function context(overrides: Record<string, unknown> = {}) {
  return {
    phone: '+233241234567',
    participantFirstName: 'Ama',
    deleted: false,
    courseName: 'ESG and Sustainability Reporting',
    cohortLabel: 'JUL 2026',
    startDate: '2026-08-03',
    courseFee: 680,
    balance: 680,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientMock.isVoiceConfigured.mockReturnValue(true);
  clientMock.startOutboundCall.mockResolvedValue({ vapiCallId: 'vapi-1' });
  repositoryMock.selectPaymentFollowupRegistrations.mockResolvedValue([]);
  repositoryMock.selectBankTransferChaseRegistrations.mockResolvedValue([]);
  repositoryMock.selectNoShowRegistrations.mockResolvedValue([]);
  repositoryMock.selectFeedbackVoiceRegistrations.mockResolvedValue([]);
  repositoryMock.selectUpsellCandidates.mockResolvedValue([]);
  repositoryMock.selectCallContexts.mockResolvedValue(new Map());
  repositoryMock.reserveCallSlot.mockResolvedValue({ outcome: 'reserved', id: 'log-1' });
  repositoryMock.updateCallLog.mockResolvedValue(undefined);
});

describe('calling window', () => {
  it('schedules dialing for 10:00 Ghana time on the dispatch day', () => {
    expect(callingWindowStart(new Date('2026-07-20T07:00:00Z'))).toBe(
      '2026-07-20T10:00:00.000Z',
    );
  });
});

describe('runVoiceCallDispatch', () => {
  it('does nothing when Vapi is not configured', async () => {
    clientMock.isVoiceConfigured.mockReturnValue(false);
    const summary = await runVoiceCallDispatch();
    expect(summary.callsScheduled).toBe(0);
    expect(repositoryMock.selectPaymentFollowupRegistrations).not.toHaveBeenCalled();
  });

  it('reserves the call_log slot before dialing and schedules inside the window', async () => {
    repositoryMock.selectPaymentFollowupRegistrations.mockResolvedValue(['reg-1']);
    repositoryMock.selectCallContexts.mockResolvedValue(new Map([['reg-1', context()]]));

    const callOrder: string[] = [];
    repositoryMock.reserveCallSlot.mockImplementation(async () => {
      callOrder.push('reserve');
      return { outcome: 'reserved', id: 'log-1' };
    });
    clientMock.startOutboundCall.mockImplementation(async () => {
      callOrder.push('dial');
      return { vapiCallId: 'vapi-1' };
    });

    const summary = await runVoiceCallDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(callOrder).toEqual(['reserve', 'dial']);
    expect(clientMock.startOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({
        earliestAt: '2026-07-20T10:00:00.000Z',
        variableValues: expect.objectContaining({
          call_type: 'payment_followup',
          participant_name: 'Ama',
        }),
      }),
    );
    expect(summary.callsScheduled).toBe(1);
  });

  it('skips duplicates without dialing (one call per registration per type)', async () => {
    repositoryMock.selectPaymentFollowupRegistrations.mockResolvedValue(['reg-1']);
    repositoryMock.selectCallContexts.mockResolvedValue(new Map([['reg-1', context()]]));
    repositoryMock.reserveCallSlot.mockResolvedValue({ outcome: 'duplicate' });

    const summary = await runVoiceCallDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(summary.skippedDuplicates).toBe(1);
    expect(clientMock.startOutboundCall).not.toHaveBeenCalled();
  });

  it('never calls a soft-deleted participant or an unusable phone', async () => {
    repositoryMock.selectPaymentFollowupRegistrations.mockResolvedValue(['reg-1', 'reg-2']);
    repositoryMock.selectCallContexts.mockResolvedValue(
      new Map([
        ['reg-1', context({ deleted: true })],
        ['reg-2', context({ phone: '12345' })],
      ]),
    );

    const summary = await runVoiceCallDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(clientMock.startOutboundCall).not.toHaveBeenCalled();
    expect(summary.skippedBadPhone).toBe(1);
  });

  it('marks the reservation failed when dialing throws', async () => {
    repositoryMock.selectPaymentFollowupRegistrations.mockResolvedValue(['reg-1']);
    repositoryMock.selectCallContexts.mockResolvedValue(new Map([['reg-1', context()]]));
    clientMock.startOutboundCall.mockRejectedValue(new Error('vapi down'));

    const summary = await runVoiceCallDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(repositoryMock.updateCallLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'failed' }),
    );
    expect(summary.errors).toHaveLength(1);
  });

  it('passes upsell pitch variables through to the call', async () => {
    repositoryMock.selectUpsellCandidates.mockResolvedValue([
      {
        registrationId: 'reg-9',
        pitchCourseName: 'AI-Powered Financial Reporting and Modeling',
        pitchCohortLabel: 'SEP 2026',
        pitchStartDate: '2026-09-07',
        pitchFee: 800,
      },
    ]);
    repositoryMock.selectCallContexts.mockResolvedValue(new Map([['reg-9', context()]]));

    await runVoiceCallDispatch(new Date('2026-07-20T07:00:00Z'));

    expect(clientMock.startOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({
        variableValues: expect.objectContaining({
          call_type: 'upsell',
          pitch_course_name: 'AI-Powered Financial Reporting and Modeling',
          pitch_fee: 'GHS 800.00',
        }),
      }),
    );
  });
});

describe('handleEndOfCallReport', () => {
  it('stores summary, transcript, and structured payment data', async () => {
    repositoryMock.selectCallLogByVapiId.mockResolvedValue({
      id: 'log-1',
      call_type: 'payment_followup',
      registration_id: 'reg-1',
      needs_human_followup: false,
    });

    const outcome = await handleEndOfCallReport({
      vapiCallId: 'vapi-1',
      summary: 'Promised to pay Friday by bank transfer.',
      transcript: 'AGENT: ... CUSTOMER: ...',
      structuredData: {
        promised_payment_date: '2026-07-24',
        bank_reference: 'TRX-889',
        needs_human_followup: false,
      },
      endedReason: 'customer-ended-call',
    });

    expect(outcome).toBe('updated');
    expect(repositoryMock.updateCallLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({
        status: 'completed',
        promised_payment_date: '2026-07-24',
        bank_reference: 'TRX-889',
      }),
    );
  });

  it('ingests voice feedback into the feedback table', async () => {
    repositoryMock.selectCallLogByVapiId.mockResolvedValue({
      id: 'log-2',
      call_type: 'feedback_voice',
      registration_id: 'reg-2',
      needs_human_followup: false,
    });

    await handleEndOfCallReport({
      vapiCallId: 'vapi-2',
      summary: 'Feedback collected.',
      transcript: null,
      structuredData: {
        overall_rating: 5,
        facilitator_rating: 4,
        recommend_rating: 5,
        improvement_text: 'More exercises.',
        testimonial_consent: true,
      },
      endedReason: null,
    });

    expect(submitFeedbackMock).toHaveBeenCalledWith(
      'reg-2',
      expect.objectContaining({ overallRating: 5, facilitatorRating: 4 }),
    );
  });

  it('returns unknown_call for an unrecognized Vapi call id', async () => {
    repositoryMock.selectCallLogByVapiId.mockResolvedValue(null);
    const outcome = await handleEndOfCallReport({
      vapiCallId: 'vapi-x',
      summary: null,
      transcript: null,
      structuredData: null,
      endedReason: null,
    });
    expect(outcome).toBe('unknown_call');
    expect(repositoryMock.updateCallLog).not.toHaveBeenCalled();
  });
});
