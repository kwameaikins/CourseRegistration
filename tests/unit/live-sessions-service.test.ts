import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectLiveSessions: vi.fn(),
  selectLiveSessionById: vi.fn(),
  insertLiveSession: vi.fn(),
  updateLiveSessionById: vi.fn(),
  insertLiveSessionAuditEvent: vi.fn(),
};

vi.mock('@/modules/live-sessions/repository', () => repositoryMock);

const { createLiveSession, updateLiveSession } = await import('@/modules/live-sessions/service');

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    batch_id: '22222222-2222-4222-8222-222222222222',
    tutor_staff_id: null,
    title: 'Module 1',
    agenda: null,
    learning_outcomes: null,
    starts_at: '2026-08-01T09:00:00.000Z',
    ends_at: '2026-08-01T11:00:00.000Z',
    timezone: 'Africa/Accra',
    provider: 'zoom',
    zoom_meeting_id: null,
    status: 'scheduled',
    status_reason: null,
    created_by: '33333333-3333-4333-8333-333333333333',
    updated_by: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-07-25T09:00:00.000Z',
    updated_at: '2026-07-25T09:00:00.000Z',
    ...overrides,
  };
}

const actorStaffId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMock.insertLiveSessionAuditEvent.mockResolvedValue(undefined);
});

describe('createLiveSession', () => {
  it('creates a scheduled session and records its audit event', async () => {
    repositoryMock.insertLiveSession.mockResolvedValue(sessionRow());

    const result = await createLiveSession(
      {
        batchId: '22222222-2222-4222-8222-222222222222',
        tutorStaffId: null,
        title: 'Module 1',
        agenda: null,
        learningOutcomes: null,
        startsAt: '2026-08-01T09:00:00.000Z',
        endsAt: '2026-08-01T11:00:00.000Z',
        timezone: 'Africa/Accra',
        status: 'scheduled',
      },
      actorStaffId,
    );

    expect(result.status).toBe('scheduled');
    expect(repositoryMock.insertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({ batch_id: '22222222-2222-4222-8222-222222222222', status: 'scheduled' }),
    );
    expect(repositoryMock.insertLiveSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'created', actor_staff_id: actorStaffId }),
    );
  });
});

describe('updateLiveSession', () => {
  it('allows the next lifecycle transition and audits it', async () => {
    const existing = sessionRow({ status: 'scheduled' });
    repositoryMock.selectLiveSessionById.mockResolvedValue(existing);
    repositoryMock.updateLiveSessionById.mockResolvedValue(sessionRow({ status: 'ready' }));

    const result = await updateLiveSession(existing.id, { status: 'ready' }, actorStaffId);

    expect(result.status).toBe('ready');
    expect(repositoryMock.insertLiveSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'status_changed',
        details: { fromStatus: 'scheduled', toStatus: 'ready' },
      }),
    );
  });

  it('rejects skipping a required lifecycle step', async () => {
    const existing = sessionRow({ status: 'scheduled' });
    repositoryMock.selectLiveSessionById.mockResolvedValue(existing);

    await expect(updateLiveSession(existing.id, { status: 'completed' }, actorStaffId)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
    expect(repositoryMock.updateLiveSessionById).not.toHaveBeenCalled();
  });

  it('requires a reason when a session is cancelled', async () => {
    const existing = sessionRow({ status: 'scheduled' });
    repositoryMock.selectLiveSessionById.mockResolvedValue(existing);

    await expect(updateLiveSession(existing.id, { status: 'cancelled' }, actorStaffId)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});