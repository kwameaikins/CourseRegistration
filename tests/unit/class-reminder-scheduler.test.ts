import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectConfirmedRegistrationsInActiveBatches: vi.fn(),
};
const sendEmailOnceMock = vi.fn();
const sendWhatsappOnceMock = vi.fn();
const sendSmsOnceMock = vi.fn();

vi.mock('@/modules/communications/repository', () => repositoryMock);
vi.mock('@/modules/communications/email-engine', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
}));
vi.mock('@/modules/communications/whatsapp-engine', () => ({
  sendWhatsappOnce: (...args: unknown[]) => sendWhatsappOnceMock(...args),
}));
vi.mock('@/modules/communications/sms-engine', () => ({
  sendSmsOnce: (...args: unknown[]) => sendSmsOnceMock(...args),
}));

const { dueClassReminderTypes, runClassReminderDispatch } = await import(
  '@/modules/communications/class-reminder-scheduler'
);

const NOW = new Date('2026-07-10T07:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  sendEmailOnceMock.mockResolvedValue('sent');
  sendWhatsappOnceMock.mockResolvedValue('sent');
  sendSmsOnceMock.mockResolvedValue('sent');
});

describe('dueClassReminderTypes', () => {
  it('is due for class_reminder_24h when the batch starts tomorrow', () => {
    const due = dueClassReminderTypes(NOW, '2026-07-11', '09:00:00');
    expect(due).toContain('class_reminder_24h');
  });

  it('is not due for class_reminder_24h on any other day', () => {
    const due = dueClassReminderTypes(NOW, '2026-07-15', '09:00:00');
    expect(due).not.toContain('class_reminder_24h');
  });

  it('is due for class_reminder_2h when the batch starts within the next 2 hours', () => {
    const due = dueClassReminderTypes(NOW, '2026-07-10', '08:30:00');
    expect(due).toContain('class_reminder_2h');
  });

  it('is not due for class_reminder_2h when the start is more than 2 hours away', () => {
    const due = dueClassReminderTypes(NOW, '2026-07-10', '10:00:00');
    expect(due).not.toContain('class_reminder_2h');
  });

  it('is not due for class_reminder_2h once the start time has already passed', () => {
    const due = dueClassReminderTypes(NOW, '2026-07-10', '06:00:00');
    expect(due).not.toContain('class_reminder_2h');
  });

  it('can be due for both types on the same run', () => {
    // Tomorrow (UTC) happens to start within 2 hours of "now" — an edge case
    // near midnight, still handled independently per type.
    const dueTomorrow = new Date('2026-07-10T22:30:00Z');
    const due = dueClassReminderTypes(dueTomorrow, '2026-07-11', '00:15:00');
    expect(due).toEqual(['class_reminder_24h', 'class_reminder_2h']);
  });
});

describe('runClassReminderDispatch', () => {
  it('sends class_reminder_24h on all 3 channels for a batch starting tomorrow', async () => {
    repositoryMock.selectConfirmedRegistrationsInActiveBatches.mockResolvedValue([
      {
        registrationId: 'reg-1',
        batchStartDate: '2026-07-11',
        batchStartTime: '09:00:00',
        classReminderEnabled: true,
      },
    ]);

    const summary = await runClassReminderDispatch(NOW);

    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'class_reminder_24h');
    expect(sendWhatsappOnceMock).toHaveBeenCalledWith('reg-1', 'class_reminder_24h');
    expect(sendSmsOnceMock).toHaveBeenCalledWith('reg-1', 'class_reminder_24h');
    expect(summary.sent).toBe(1);
    expect(summary.whatsappSent).toBe(1);
    expect(summary.smsSent).toBe(1);
  });

  it('sends nothing for a batch that is neither tomorrow nor within 2 hours', async () => {
    repositoryMock.selectConfirmedRegistrationsInActiveBatches.mockResolvedValue([
      {
        registrationId: 'reg-1',
        batchStartDate: '2026-08-01',
        batchStartTime: '09:00:00',
        classReminderEnabled: true,
      },
    ]);

    const summary = await runClassReminderDispatch(NOW);

    expect(sendEmailOnceMock).not.toHaveBeenCalled();
    expect(summary.evaluated).toBe(1);
    expect(summary.sent).toBe(0);
  });

  it('counts deduplicated and gated outcomes separately', async () => {
    repositoryMock.selectConfirmedRegistrationsInActiveBatches.mockResolvedValue([
      {
        registrationId: 'reg-1',
        batchStartDate: '2026-07-11',
        batchStartTime: '09:00:00',
        classReminderEnabled: true,
      },
    ]);
    sendEmailOnceMock.mockResolvedValue('skipped_duplicate');

    const summary = await runClassReminderDispatch(NOW);

    expect(summary.skippedDeduplicated).toBe(1);
    expect(summary.sent).toBe(0);
  });

  it('records a failed send in errors without throwing', async () => {
    repositoryMock.selectConfirmedRegistrationsInActiveBatches.mockResolvedValue([
      {
        registrationId: 'reg-1',
        batchStartDate: '2026-07-11',
        batchStartTime: '09:00:00',
        classReminderEnabled: true,
      },
    ]);
    sendEmailOnceMock.mockResolvedValue('failed');

    const summary = await runClassReminderDispatch(NOW);

    expect(summary.errors).toEqual(['reg-1/class_reminder_24h: send failed']);
  });
});
