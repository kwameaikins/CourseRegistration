import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectUnpaidRegistrationsInActiveBatches: vi.fn(),
  selectCurrentPaymentStatus: vi.fn(),
};
const sendEmailOnceMock = vi.fn();

vi.mock('@/modules/communications/repository', () => repositoryMock);
vi.mock('@/modules/communications/email-engine', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
}));

const { dueReminderTypes, runDailyReminders } = await import(
  '@/modules/communications/reminder-scheduler'
);

const NOW = new Date('2026-07-10T07:00:00Z');

describe('reminder timing conditions (E03–E06)', () => {
  it('a fresh registration is only due reminder_1', () => {
    const due = dueReminderTypes(NOW, new Date('2026-07-10T06:00:00Z'), '2026-07-30');
    expect(due).toEqual(['reminder_1']);
  });

  it('reminder_2 becomes due 24h after registration (E04)', () => {
    const due = dueReminderTypes(NOW, new Date('2026-07-09T06:00:00Z'), '2026-07-30');
    expect(due).toContain('reminder_2');
  });

  it('reminder_3 becomes due 2 days before the start date (E05)', () => {
    const due = dueReminderTypes(NOW, new Date('2026-07-10T06:00:00Z'), '2026-07-12');
    expect(due).toContain('reminder_3');
  });

  it('reminder_4 becomes due the morning of the start date (E06)', () => {
    const due = dueReminderTypes(NOW, new Date('2026-07-01T06:00:00Z'), '2026-07-10');
    expect(due).toContain('reminder_4');
  });
});

describe('BR-08 — reminder cancellation on payment (T-BR08-01 logic)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the send when payment_status is Paid at send time, logging skippedPaidSinceQuery', async () => {
    repositoryMock.selectUnpaidRegistrationsInActiveBatches.mockResolvedValue([
      {
        registrationId: 'reg-1',
        registeredAt: '2026-07-10T06:00:00Z',
        batchStartDate: '2026-07-30',
        paymentReminderEnabled: true,
      },
    ]);
    // Payment confirmed between the candidate query and the send.
    repositoryMock.selectCurrentPaymentStatus.mockResolvedValue('Paid');

    const summary = await runDailyReminders(NOW);

    expect(summary.skippedPaidSinceQuery).toBe(1);
    expect(summary.sent).toBe(0);
    expect(sendEmailOnceMock).not.toHaveBeenCalled();
  });

  it('sends when payment is still Unpaid at send time', async () => {
    repositoryMock.selectUnpaidRegistrationsInActiveBatches.mockResolvedValue([
      {
        registrationId: 'reg-1',
        registeredAt: '2026-07-10T06:00:00Z',
        batchStartDate: '2026-07-30',
        paymentReminderEnabled: true,
      },
    ]);
    repositoryMock.selectCurrentPaymentStatus.mockResolvedValue('Unpaid');
    sendEmailOnceMock.mockResolvedValue('sent');

    const summary = await runDailyReminders(NOW);

    expect(summary.sent).toBe(1);
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'reminder_1');
  });

  it('counts deduplicated skips separately (cron re-run safety, T-INT-05 logic)', async () => {
    repositoryMock.selectUnpaidRegistrationsInActiveBatches.mockResolvedValue([
      {
        registrationId: 'reg-1',
        registeredAt: '2026-07-10T06:00:00Z',
        batchStartDate: '2026-07-30',
        paymentReminderEnabled: true,
      },
    ]);
    repositoryMock.selectCurrentPaymentStatus.mockResolvedValue('Unpaid');
    sendEmailOnceMock.mockResolvedValue('skipped_duplicate');

    const summary = await runDailyReminders(NOW);

    expect(summary.sent).toBe(0);
    expect(summary.skippedDeduplicated).toBe(1);
  });
});
