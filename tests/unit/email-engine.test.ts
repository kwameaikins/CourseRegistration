import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegistrationEmailContext } from '@/modules/communications/types';

const repositoryMock = {
  selectRegistrationEmailContext: vi.fn(),
  selectTemplate: vi.fn(),
  reserveEmailLogSlot: vi.fn(),
  updateEmailLogEntry: vi.fn(),
};
const sendTransactionalEmailMock = vi.fn();

vi.mock('@/modules/communications/repository', () => repositoryMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));

const { renderTemplateBody, sendEmailOnce } = await import(
  '@/modules/communications/email-engine'
);

function makeContext(overrides: Partial<RegistrationEmailContext> = {}): RegistrationEmailContext {
  return {
    registrationId: 'reg-1',
    participantFullName: 'Ama Owusu',
    participantEmail: 'ama@example.com',
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMock.selectRegistrationEmailContext.mockResolvedValue(makeContext());
  repositoryMock.selectTemplate.mockResolvedValue({
    id: 't-1',
    course_id: 'course-1',
    email_type: 'welcome',
    subject: 'Welcome {{participant_name}}',
    body: '<p>Hi {{participant_name}}, {{course_name}} starts {{start_date}}.</p>',
    is_active: true,
  });
  repositoryMock.reserveEmailLogSlot.mockResolvedValue('reserved');
  repositoryMock.updateEmailLogEntry.mockResolvedValue(undefined);
  sendTransactionalEmailMock.mockResolvedValue(undefined);
});

describe('renderTemplateBody (Document 7, Section 2.3)', () => {
  it('replaces known placeholders', () => {
    expect(renderTemplateBody('Hi {{participant_name}}', { participant_name: 'Ama' })).toBe(
      'Hi Ama',
    );
  });

  it('leaves unknown placeholders visible rather than blank', () => {
    expect(renderTemplateBody('Hi {{typo_field}}', { participant_name: 'Ama' })).toBe(
      'Hi {{typo_field}}',
    );
  });
});

describe('BR-07 — sendEmailOnce reservation-before-send (T-BR07-01 logic)', () => {
  it('reserves the email_log slot BEFORE calling Resend, then marks success', async () => {
    const callOrder: string[] = [];
    repositoryMock.reserveEmailLogSlot.mockImplementation(async () => {
      callOrder.push('reserve');
      return 'reserved';
    });
    sendTransactionalEmailMock.mockImplementation(async () => {
      callOrder.push('send');
    });

    const outcome = await sendEmailOnce('reg-1', 'welcome');

    expect(outcome).toBe('sent');
    expect(callOrder).toEqual(['reserve', 'send']);
    expect(repositoryMock.updateEmailLogEntry).toHaveBeenCalledWith('reg-1', 'welcome', {
      success: true,
      error_message: null,
    });
  });

  it('skips without calling Resend when the slot is already reserved (duplicate)', async () => {
    repositoryMock.reserveEmailLogSlot.mockResolvedValue('duplicate');

    const outcome = await sendEmailOnce('reg-1', 'welcome');

    expect(outcome).toBe('skipped_duplicate');
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('records the failure and reports failed when Resend throws (T-INT-04 logic)', async () => {
    sendTransactionalEmailMock.mockRejectedValue(new Error('resend down'));

    const outcome = await sendEmailOnce('reg-1', 'welcome');

    expect(outcome).toBe('failed');
    expect(repositoryMock.updateEmailLogEntry).toHaveBeenCalledWith(
      'reg-1',
      'welcome',
      expect.objectContaining({ success: false }),
    );
  });
});

describe('BR-09/BR-10 — gates checked BEFORE the BR-07 reservation', () => {
  it('does not reserve a slot for an inactive batch (BR-09)', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ batchIsActive: false }),
    );

    const outcome = await sendEmailOnce('reg-1', 'welcome');

    expect(outcome).toBe('skipped_gated');
    expect(repositoryMock.reserveEmailLogSlot).not.toHaveBeenCalled();
  });

  it('does not reserve a slot when the type toggle is off (BR-10)', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ paymentReminderEnabled: false }),
    );

    const outcome = await sendEmailOnce('reg-1', 'reminder_2');

    expect(outcome).toBe('skipped_gated');
    expect(repositoryMock.reserveEmailLogSlot).not.toHaveBeenCalled();
  });

  it('does not reserve a slot when no template exists (no permanent block)', async () => {
    repositoryMock.selectTemplate.mockResolvedValue(null);

    const outcome = await sendEmailOnce('reg-1', 'welcome');

    expect(outcome).toBe('skipped_no_template');
    expect(repositoryMock.reserveEmailLogSlot).not.toHaveBeenCalled();
  });

  it('never emails a soft-deleted participant (BR-16)', async () => {
    repositoryMock.selectRegistrationEmailContext.mockResolvedValue(
      makeContext({ participantDeleted: true }),
    );

    const outcome = await sendEmailOnce('reg-1', 'welcome');

    expect(outcome).toBe('skipped_deleted_participant');
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });
});
