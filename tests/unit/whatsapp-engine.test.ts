import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegistrationEmailContext } from '@/modules/communications/types';

const repositoryMock = {
  selectRegistrationEmailContext: vi.fn(),
  reserveWhatsappLogSlot: vi.fn(),
  updateWhatsappLogEntry: vi.fn(),
};
const clientMock = {
  isWhatsappConfigured: vi.fn(),
  sendWhatsappTemplateMessage: vi.fn(),
};

vi.mock('@/modules/communications/repository', () => repositoryMock);
vi.mock('@/lib/whatsapp/client', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/whatsapp/client')>('@/lib/whatsapp/client');
  return {
    normalizeWhatsappPhone: actual.normalizeWhatsappPhone,
    isWhatsappConfigured: () => clientMock.isWhatsappConfigured(),
    sendWhatsappTemplateMessage: (...args: unknown[]) =>
      clientMock.sendWhatsappTemplateMessage(...args),
  };
});

const { sendWhatsappOnce, templateForMessageType } = await import(
  '@/modules/communications/whatsapp-engine'
);
const { normalizeWhatsappPhone } = await import('@/lib/whatsapp/client');

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
    isFree: false,
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
  clientMock.isWhatsappConfigured.mockReturnValue(true);
  clientMock.sendWhatsappTemplateMessage.mockResolvedValue(undefined);
  repositoryMock.selectRegistrationEmailContext.mockResolvedValue(makeContext());
  repositoryMock.reserveWhatsappLogSlot.mockResolvedValue('reserved');
  repositoryMock.updateWhatsappLogEntry.mockResolvedValue(undefined);
});

describe('Ghana phone normalization for WhatsApp', () => {
  it('accepts +233 international format', () => {
    expect(normalizeWhatsappPhone('+233 24 123 4567')).toBe('233241234567');
  });

  it('converts local 0-prefixed format to 233', () => {
    expect(normalizeWhatsappPhone('0241234567')).toBe('233241234567');
  });

  it('converts 00233 dialing prefix', () => {
    expect(normalizeWhatsappPhone('00233241234567')).toBe('233241234567');
  });

  it('rejects obviously unusable values', () => {
    expect(normalizeWhatsappPhone('12345')).toBeNull();
  });
});

// Free events (2026-08-03): every money-shaped WhatsApp template quotes an
// amount in its Meta-approved positional parameters, so none can be sent for
// a webinar without reading "GHS 0.00". Skipped BEFORE the BR-07 reservation
// so they become sendable the moment a fee-free template is approved.
describe('sendWhatsappOnce — free events suppress the money-shaped templates', () => {
  beforeEach(() => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ isFree: true, courseFee: 0, balance: 0 }),
    );
  });

  it.each(['welcome', 'payment_confirmation', 'reminder_1', 'reminder_4'] as const)(
    'skips %s without reserving a log slot',
    async (messageType) => {
      const outcome = await sendWhatsappOnce('reg-1', messageType);

      expect(outcome).toBe('skipped_gated');
      expect(repositoryMock.reserveWhatsappLogSlot).not.toHaveBeenCalled();
      expect(clientMock.sendWhatsappTemplateMessage).not.toHaveBeenCalled();
    },
  );

  it('still sends the group invite, which quotes no amount', async () => {
    const outcome = await sendWhatsappOnce('reg-1', 'whatsapp_invite');

    expect(outcome).toBe('sent');
    expect(clientMock.sendWhatsappTemplateMessage).toHaveBeenCalled();
  });
});

describe('sendWhatsappOnce — reservation-before-send (BR-07 analog)', () => {
  it('reserves the whatsapp_log slot before calling the Cloud API, then marks success', async () => {
    const callOrder: string[] = [];
    repositoryMock.reserveWhatsappLogSlot.mockImplementation(async () => {
      callOrder.push('reserve');
      return 'reserved';
    });
    clientMock.sendWhatsappTemplateMessage.mockImplementation(async () => {
      callOrder.push('send');
    });

    const outcome = await sendWhatsappOnce('reg-1', 'welcome');

    expect(outcome).toBe('sent');
    expect(callOrder).toEqual(['reserve', 'send']);
    expect(repositoryMock.updateWhatsappLogEntry).toHaveBeenCalledWith('reg-1', 'welcome', {
      success: true,
      error_message: null,
    });
  });

  it('skips without calling the API when the slot is already reserved', async () => {
    repositoryMock.reserveWhatsappLogSlot.mockResolvedValue('duplicate');
    const outcome = await sendWhatsappOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_duplicate');
    expect(clientMock.sendWhatsappTemplateMessage).not.toHaveBeenCalled();
  });

  it('records the failure when the Cloud API call throws', async () => {
    clientMock.sendWhatsappTemplateMessage.mockRejectedValue(new Error('meta down'));
    const outcome = await sendWhatsappOnce('reg-1', 'welcome');
    expect(outcome).toBe('failed');
    expect(repositoryMock.updateWhatsappLogEntry).toHaveBeenCalledWith(
      'reg-1',
      'welcome',
      expect.objectContaining({ success: false }),
    );
  });
});

describe('sendWhatsappOnce — gates checked BEFORE reservation', () => {
  it('skips without reserving when Meta credentials are not configured', async () => {
    clientMock.isWhatsappConfigured.mockReturnValue(false);
    const outcome = await sendWhatsappOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_not_configured');
    expect(repositoryMock.reserveWhatsappLogSlot).not.toHaveBeenCalled();
  });

  it('skips for an inactive batch', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ batchIsActive: false }),
    );
    const outcome = await sendWhatsappOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_gated');
    expect(repositoryMock.reserveWhatsappLogSlot).not.toHaveBeenCalled();
  });

  it('skips when the per-batch WhatsApp toggle is off', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ whatsappEnabled: false }),
    );
    const outcome = await sendWhatsappOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_gated');
    expect(repositoryMock.reserveWhatsappLogSlot).not.toHaveBeenCalled();
  });

  it('skips reminders when the payment-reminder toggle is off (BR-10 mapping)', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ paymentReminderEnabled: false }),
    );
    const outcome = await sendWhatsappOnce('reg-1', 'reminder_2');
    expect(outcome).toBe('skipped_gated');
  });

  it('never messages a soft-deleted participant (BR-16)', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ participantDeleted: true }),
    );
    const outcome = await sendWhatsappOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_deleted_participant');
    expect(clientMock.sendWhatsappTemplateMessage).not.toHaveBeenCalled();
  });

  it('skips an unusable phone number without reserving', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ participantPhone: '12345' }),
    );
    const outcome = await sendWhatsappOnce('reg-1', 'welcome');
    expect(outcome).toBe('skipped_bad_phone');
    expect(repositoryMock.reserveWhatsappLogSlot).not.toHaveBeenCalled();
  });
});

describe('template mapping', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('maps welcome to the registration-welcome template with fee and community links', () => {
    process.env.COMMUNITY_WHATSAPP_LINK = 'https://chat.whatsapp.com/pln-group';
    process.env.COMMUNITY_WHATSAPP_CHANNEL_LINK = 'https://whatsapp.com/channel/abc';

    const { templateName, bodyParameters } = templateForMessageType(
      'welcome',
      makeContext(),
    );
    expect(templateName).toBe('course_registration_welcome');
    expect(bodyParameters).toEqual([
      'Ama',
      'ICAG Level 1 Prep (JUL-2026)',
      '2026-07-14',
      'GHS 1,200.00',
      'https://chat.whatsapp.com/pln-group',
      'https://whatsapp.com/channel/abc',
    ]);
  });

  it('maps all reminders to the shared payment-reminder template with balance', () => {
    const { templateName, bodyParameters } = templateForMessageType(
      'reminder_3',
      makeContext({ balance: 800 }),
    );
    expect(templateName).toBe('course_payment_reminder');
    expect(bodyParameters[2]).toBe('GHS 800.00');
  });

  it('maps payment_confirmation with the amount paid and the course-specific group link', () => {
    const { templateName, bodyParameters } = templateForMessageType(
      'payment_confirmation',
      makeContext({ amountPaid: 1200, whatsappGroupLink: 'https://chat.whatsapp.com/course-x' }),
    );
    expect(templateName).toBe('course_payment_confirmation');
    expect(bodyParameters[2]).toBe('GHS 1,200.00');
    expect(bodyParameters[3]).toBe('https://chat.whatsapp.com/course-x');
  });
});
