import { beforeEach, describe, expect, it, vi } from 'vitest';

const waitlistRepositoryMock = {
  insertWaitlistEntry: vi.fn(),
  selectOldestWaitingEntry: vi.fn(),
  updateWaitlistEntryStatus: vi.fn(),
  selectParticipantContact: vi.fn(),
  selectWaitlistForBatchStaff: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const sendTransactionalEmailMock = vi.fn();

vi.mock('@/modules/waitlist/repository', () => waitlistRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));

const { joinWaitlist, notifyNextIfSeatAvailable, getWaitlistForBatch } = await import(
  '@/modules/waitlist/service'
);

beforeEach(() => {
  vi.clearAllMocks();
  waitlistRepositoryMock.insertWaitlistEntry.mockResolvedValue({ id: 'waitlist-1' });
  waitlistRepositoryMock.updateWaitlistEntryStatus.mockResolvedValue(undefined);
  sendTransactionalEmailMock.mockResolvedValue(undefined);
  usersServiceMock.requireRole.mockResolvedValue({
    id: 'staff-1',
    fullName: 'Jane Doe',
    role: 'admin',
  });
});

describe('joinWaitlist', () => {
  const input = {
    participantId: 'participant-1',
    participantEmail: 'ama@example.com',
    participantFullName: 'Ama Owusu',
    batchId: 'batch-1',
    courseName: 'AI for Business',
    cohortLabel: 'Cohort 4',
    leadSource: 'WhatsApp' as const,
  };

  it('inserts a waitlist entry and returns its id', async () => {
    const result = await joinWaitlist(input);
    expect(result).toEqual({ waitlistId: 'waitlist-1' });
    expect(waitlistRepositoryMock.insertWaitlistEntry).toHaveBeenCalledWith({
      participant_id: 'participant-1',
      batch_id: 'batch-1',
      lead_source: 'WhatsApp',
      consent_given: true,
    });
  });

  it('sends a confirmation email', async () => {
    await joinWaitlist(input);
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ama@example.com' }),
    );
  });

  it('maps a unique-constraint violation to ALREADY_ON_WAITLIST', async () => {
    waitlistRepositoryMock.insertWaitlistEntry.mockRejectedValue({ code: '23505' });
    await expect(joinWaitlist(input)).rejects.toMatchObject({ code: 'ALREADY_ON_WAITLIST' });
  });

  it('still succeeds if the confirmation email fails to send', async () => {
    sendTransactionalEmailMock.mockRejectedValue(new Error('resend down'));
    await expect(joinWaitlist(input)).resolves.toEqual({ waitlistId: 'waitlist-1' });
  });
});

describe('notifyNextIfSeatAvailable', () => {
  const batchContext = { courseName: 'AI for Business', cohortLabel: 'Cohort 4' };

  it('does nothing when seatsRemaining is null (unlimited capacity)', async () => {
    await notifyNextIfSeatAvailable('batch-1', null, batchContext);
    expect(waitlistRepositoryMock.selectOldestWaitingEntry).not.toHaveBeenCalled();
  });

  it('does nothing when there are no free seats', async () => {
    await notifyNextIfSeatAvailable('batch-1', 0, batchContext);
    expect(waitlistRepositoryMock.selectOldestWaitingEntry).not.toHaveBeenCalled();
  });

  it('does nothing when no one is waiting', async () => {
    waitlistRepositoryMock.selectOldestWaitingEntry.mockResolvedValue(null);
    await notifyNextIfSeatAvailable('batch-1', 2, batchContext);
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('offers the oldest waiting entry and emails them', async () => {
    waitlistRepositoryMock.selectOldestWaitingEntry.mockResolvedValue({
      id: 'waitlist-1',
      participant_id: 'participant-1',
    });
    waitlistRepositoryMock.selectParticipantContact.mockResolvedValue({
      email: 'ama@example.com',
      fullName: 'Ama Owusu',
    });

    await notifyNextIfSeatAvailable('batch-1', 1, batchContext);

    expect(waitlistRepositoryMock.updateWaitlistEntryStatus).toHaveBeenCalledWith(
      'waitlist-1',
      expect.objectContaining({ status: 'Offered' }),
    );
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ama@example.com' }),
    );
  });
});

describe('getWaitlistForBatch', () => {
  it('requires a staff role that can read the waitlist', async () => {
    waitlistRepositoryMock.selectWaitlistForBatchStaff.mockResolvedValue([]);
    await getWaitlistForBatch('batch-1');
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith([
      'admin',
      'finance',
      'marketing',
      'management',
    ]);
  });

  it('maps repository rows to the staff view shape', async () => {
    waitlistRepositoryMock.selectWaitlistForBatchStaff.mockResolvedValue([
      {
        id: 'waitlist-1',
        participant_id: 'participant-1',
        batch_id: 'batch-1',
        status: 'Waiting',
        lead_source: 'WhatsApp',
        offered_at: null,
        converted_registration_id: null,
        notes: null,
        created_at: '2026-07-24T09:00:00Z',
        participantFullName: 'Ama Owusu',
        participantEmail: 'ama@example.com',
        participantPhone: '+233241234567',
      },
    ]);

    const result = await getWaitlistForBatch('batch-1');
    expect(result).toEqual([
      {
        id: 'waitlist-1',
        participantId: 'participant-1',
        batchId: 'batch-1',
        status: 'Waiting',
        leadSource: 'WhatsApp',
        offeredAt: null,
        convertedRegistrationId: null,
        notes: null,
        createdAt: '2026-07-24T09:00:00Z',
        fullName: 'Ama Owusu',
        email: 'ama@example.com',
        phone: '+233241234567',
      },
    ]);
  });
});
