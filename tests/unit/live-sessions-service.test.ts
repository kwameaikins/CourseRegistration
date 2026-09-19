import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectLiveSessions: vi.fn(),
  selectLiveSessionById: vi.fn(),
  insertLiveSession: vi.fn(),
  updateLiveSessionById: vi.fn(),
  insertLiveSessionAuditEvent: vi.fn(),
  // Learning resources (course-level since 2026-09-19)
  insertSessionMaterialSystem: vi.fn(),
  selectSessionMaterialByIdSystem: vi.fn(),
  selectSessionMaterialsVisibleToBatchSystem: vi.fn(),
  selectBatchCourseIdSystem: vi.fn(),
  updateSessionMaterialSystem: vi.fn(),
};

vi.mock('@/modules/live-sessions/repository', () => repositoryMock);

const { createLiveSession, updateLiveSession, addSessionMaterial, isSessionMaterialVisibleToBatchSystem, getSessionMaterialsForBatchSystem } = await import('@/modules/live-sessions/service');

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
// A resource belongs to the COURSE (founder, 2026-09-19: every cohort meant
// re-uploading the same materials). The default scope is the course library;
// a cohort sees its course's library plus its own; a session-pinned resource
// is that cohort's whatever was asked.
describe('learning resources belong to the course', () => {
  const materialRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'mat-1', course_id: 'course-1', batch_id: null, live_session_id: null, uploaded_by_tutor_id: 'tutor-1', uploaded_by_staff_id: null,
    title: 'Slides', link: 'https://example.com/slides', file_path: null, file_name: null, file_size_bytes: null, content_type: null,
    created_at: '2026-09-19T00:00:00Z', ...overrides,
  });

  beforeEach(() => {
    repositoryMock.selectBatchCourseIdSystem.mockImplementation(async (batchId: string) => (batchId.startsWith('batch-c1') ? 'course-1' : batchId === 'batch-c2' ? 'course-2' : null));
    repositoryMock.insertSessionMaterialSystem.mockImplementation(async (input: Record<string, unknown>) => materialRow(input));
  });

  it('files a new resource in the course library by default, and with the cohort only when asked or when pinned to a session', async () => {
    const library = await addSessionMaterial({ batchId: 'batch-c1-nov', liveSessionId: null, uploadedByTutorId: 'tutor-1', title: 'Slides', link: 'https://example.com/a' });
    expect(library.scope).toBe('course');
    expect(repositoryMock.insertSessionMaterialSystem).toHaveBeenLastCalledWith(expect.objectContaining({ course_id: 'course-1', batch_id: null }));

    const cohortOnly = await addSessionMaterial({ batchId: 'batch-c1-nov', liveSessionId: null, scope: 'cohort', uploadedByTutorId: 'tutor-1', title: 'Recording', link: 'https://example.com/b' });
    expect(cohortOnly.scope).toBe('cohort');
    expect(repositoryMock.insertSessionMaterialSystem).toHaveBeenLastCalledWith(expect.objectContaining({ course_id: 'course-1', batch_id: 'batch-c1-nov' }));

    await addSessionMaterial({ batchId: 'batch-c1-nov', liveSessionId: 'session-3', scope: 'course', uploadedByTutorId: 'tutor-1', title: 'Session 3', link: 'https://example.com/c' });
    expect(repositoryMock.insertSessionMaterialSystem).toHaveBeenLastCalledWith(expect.objectContaining({ batch_id: 'batch-c1-nov', live_session_id: 'session-3' }));
  });

  it('refuses a resource for a cohort that does not exist', async () => {
    await expect(
      addSessionMaterial({ batchId: 'batch-nope', liveSessionId: null, uploadedByTutorId: 'tutor-1', title: 'x', link: 'https://example.com' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repositoryMock.insertSessionMaterialSystem).not.toHaveBeenCalled();
  });

  it('a cohort sees its course library and its own resources, never another course\'s', async () => {
    repositoryMock.selectSessionMaterialByIdSystem.mockImplementation(async (id: string) => (
      id === 'lib' ? materialRow() : id === 'own' ? materialRow({ id: 'own', batch_id: 'batch-c1-nov' }) : id === 'other-cohort' ? materialRow({ id: 'other-cohort', batch_id: 'batch-c1-jan' }) : materialRow({ id: 'other-course', course_id: 'course-2' })
    ));
    expect(await isSessionMaterialVisibleToBatchSystem('lib', 'batch-c1-nov')).toBe(true);
    expect(await isSessionMaterialVisibleToBatchSystem('lib', 'batch-c1-jan')).toBe(true);
    expect(await isSessionMaterialVisibleToBatchSystem('own', 'batch-c1-nov')).toBe(true);
    expect(await isSessionMaterialVisibleToBatchSystem('other-cohort', 'batch-c1-nov')).toBe(false);
    expect(await isSessionMaterialVisibleToBatchSystem('other-course', 'batch-c1-nov')).toBe(false);
    expect(await isSessionMaterialVisibleToBatchSystem('lib', 'batch-c2')).toBe(false);
  });

  it('lists what a cohort sees through the course, and nothing for an unknown cohort', async () => {
    repositoryMock.selectSessionMaterialsVisibleToBatchSystem.mockResolvedValue([materialRow(), materialRow({ id: 'own', batch_id: 'batch-c1-nov' })]);
    const rows = await getSessionMaterialsForBatchSystem('batch-c1-nov');
    expect(rows.map((r) => r.scope)).toEqual(['course', 'cohort']);
    expect(repositoryMock.selectSessionMaterialsVisibleToBatchSystem).toHaveBeenCalledWith('batch-c1-nov', 'course-1');
    expect(await getSessionMaterialsForBatchSystem('batch-nope')).toEqual([]);
  });
});
