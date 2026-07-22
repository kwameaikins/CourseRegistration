import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegistrationEmailContext } from '@/modules/communications/types';

const repositoryMock = {
  selectRegistrationEmailContext: vi.fn(),
  reserveSmsLogSlot: vi.fn(),
  updateSmsLogEntry: vi.fn(),
};
const clientMock = {
  isSmsConfigured: vi.fn(),
  sendSmsMessage: vi.fn(),
};

vi.mock('@/modules/communications/repository', () => repositoryMock);
vi.mock('@/lib/arkesel/client', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/arkesel/client')>('@/lib/arkesel/client');
  return {
    normalizeSmsPhone: actual.normalizeSmsPhone,
    isSmsConfigured: () => clientMock.isSmsConfigured(),
    sendSmsMessage: (...args: unknown[]) => clientMock.sendSmsMessage(...args),
  };
});

const { sendSmsOnce, smsBodyForMessageType } = await import(
  '@/modules/communications/sms-engine'
);

function makeContext(
  overrides: Partial<RegistrationEmailContext> = {},
): RegistrationEmailContext {
  return {
    registrationId: 'reg-1',
    participantFullName: 'Ama Owusu',
    participantFirstName: 'Ama',
    participantEmail: 'ama@example.com',
    participantPhone: '+233241234567',
    participantDeleted: false,
    courseId: 'course-1',
    courseName: 'ICAG Level 1 Prep',
    courseCode: 'ICAG-L1',
    cohortLabel: 'JUL-2026',
    courseFee: 1200,
    amountPaid: 0,
    balance: 1200,
    paymentStatus: 'Unpaid',
    startDate: '2026-07-14',
    startTime: '09:00',
    endDate: '2026-07-18',
    zoomLink: null,
    whatsappGroupLink: null,
    facilitatorName: 'Mr. Kwame Asante',
    batchIsActive: true,
    welcomeEmailEnabled: true,
    paymentReminderEnabled: true,
    classReminderEnabled: true,
    whatsappEnabled: true,
    smsEnabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientMock.isSmsConfigured.mockReturnValue(true);
  clientMock.sendSmsMessage.mockResolvedValue(undefined);
  repositoryMock.selectRegistrationEmailContext.mockResolvedValue(makeContext());
  repositoryMock.reserveSmsLogSlot.mockResolvedValue('reserved');
  repositoryMock.updateSmsLogEntry.mockResolvedValue(undefined);
});

describe('sendSmsOnce — reservation-before-send (BR-07 analog)', () => {
  it('reserves the sms_log slot before calling Arkesel, then marks success', async () => {
    const callOrder: string[] = [];
    repositoryMock.reserveSmsLogSlot.mockImplementation(async () => {
      callOrder.push('reserve');
      return 'reserved';
    });
    clientMock.sendSmsMessage.mockImplementation(async () => {
      callOrder.push('send');
    });

    const outcome = await sendSmsOnce('reg-1', 'welcome');

    expect(outcome).toBe('sent');
    expect(callOrder).toEqual(['reserve', 'send']);
    expect(repositoryMock.updateSmsLogEntry).toHaveBeenCalledWith('reg-1', 'welcome', {
      success: true,
      error_message: null,
    });
  });

  it('skips without calling the API when the slot is already reserved', async () => {
    repositoryMock.reserveSmsLogSlot.mockResolvedValue('duplicate');
    const outcome = await sendSmsOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_duplicate');
    expect(clientMock.sendSmsMessage).not.toHaveBeenCalled();
  });

  it('records the failure when the Arkesel call throws', async () => {
    clientMock.sendSmsMessage.mockRejectedValue(new Error('arkesel down'));
    const outcome = await sendSmsOnce('reg-1', 'welcome');
    expect(outcome).toBe('failed');
    expect(repositoryMock.updateSmsLogEntry).toHaveBeenCalledWith(
      'reg-1',
      'welcome',
      expect.objectContaining({ success: false }),
    );
  });
});

describe('sendSmsOnce — gates checked BEFORE reservation', () => {
  it('skips without reserving when Arkesel credentials are not configured', async () => {
    clientMock.isSmsConfigured.mockReturnValue(false);
    const outcome = await sendSmsOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_not_configured');
    expect(repositoryMock.reserveSmsLogSlot).not.toHaveBeenCalled();
  });

  it('skips for an inactive batch', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ batchIsActive: false }),
    );
    const outcome = await sendSmsOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_gated');
    expect(repositoryMock.reserveSmsLogSlot).not.toHaveBeenCalled();
  });

  it('skips when the per-batch SMS toggle is off', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ smsEnabled: false }),
    );
    const outcome = await sendSmsOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_gated');
    expect(repositoryMock.reserveSmsLogSlot).not.toHaveBeenCalled();
  });

  it('skips reminders when the payment-reminder toggle is off (BR-10 mapping)', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ paymentReminderEnabled: false }),
    );
    const outcome = await sendSmsOnce('reg-1', 'reminder_2');
    expect(outcome).toBe('skipped_gated');
  });

  it('never messages a soft-deleted participant (BR-16)', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ participantDeleted: true }),
    );
    const outcome = await sendSmsOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_deleted_participant');
    expect(clientMock.sendSmsMessage).not.toHaveBeenCalled();
  });

  it('skips an unusable phone number without reserving', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ participantPhone: '12345' }),
    );
    const outcome = await sendSmsOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_bad_phone');
    expect(repositoryMock.reserveSmsLogSlot).not.toHaveBeenCalled();
  });
});

describe('SMS body composition', () => {
  it('welcome names the course, fee, and points to the email instructions', () => {
    const body = smsBodyForMessageType('welcome', makeContext());
    expect(body).toContain('Hi Ama,');
    expect(body).toContain('ICAG Level 1 Prep (JUL-2026)');
    expect(body).toContain('GHS 1,200.00');
    expect(body).toContain('email');
  });

  it('all reminders share one body with the outstanding balance', () => {
    const body = smsBodyForMessageType('reminder_3', makeContext({ balance: 800 }));
    expect(body).toContain('GHS 800.00');
    expect(body).toContain('2026-07-14');
  });

  it('payment confirmation states the amount received and start date/time', () => {
    const body = smsBodyForMessageType(
      'payment_confirmation',
      makeContext({ amountPaid: 1200 }),
    );
    expect(body).toContain('GHS 1,200.00');
    expect(body).toContain('2026-07-14');
    expect(body).toContain('09:00');
  });
});
