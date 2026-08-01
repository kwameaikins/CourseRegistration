import { beforeEach, describe, expect, it, vi } from 'vitest';

const attendanceRepositoryMock = {
  insertAttendanceExceptionSystem: vi.fn(),
  selectAttendanceExceptions: vi.fn(),
  selectAttendanceExceptionById: vi.fn(),
  updateAttendanceExceptionById: vi.fn(),
  selectParticipantInfoForRegistrations: vi.fn(),
  applyManualAttendanceCorrection: vi.fn(),
  selectAttendanceForBatch: vi.fn(),
  selectAttendanceForBatchSystem: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};

vi.mock('@/modules/attendance/repository', () => attendanceRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/communications/service', () => ({ sendEmailOnce: vi.fn() }));
vi.mock('@/lib/zoom/client', () => ({
  addMeetingRegistrant: vi.fn(),
  getPastMeetingParticipants: vi.fn(),
  isZoomConfigured: vi.fn(() => false),
}));

const {
  raiseAttendanceException,
  listAttendanceExceptions,
  reviewAttendanceException,
  getAttendanceForBatch,
  getAttendanceForBatchSystem,
} = await import('@/modules/attendance/service');

const ADMIN_STAFF = { id: 'staff-1', fullName: 'Jane Doe', role: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue(ADMIN_STAFF);
});

describe('raiseAttendanceException (BR-34 — no tutor write path to attendance)', () => {
  it('requires requestedPresent for a correction_request', async () => {
    await expect(
      raiseAttendanceException({
        registrationId: 'reg-1',
        batchId: 'batch-1',
        sessionDate: '2026-07-01',
        exceptionType: 'correction_request',
        reason: 'Zoom dropped mid-class.',
        raisedByTutorId: 'tutor-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(attendanceRepositoryMock.insertAttendanceExceptionSystem).not.toHaveBeenCalled();
  });

  it('inserts a pending row for a no_show_flag without requiring requestedPresent', async () => {
    attendanceRepositoryMock.insertAttendanceExceptionSystem.mockResolvedValue({ id: 'exc-1' });
    await raiseAttendanceException({
      registrationId: 'reg-1',
      batchId: 'batch-1',
      sessionDate: '2026-07-01',
      exceptionType: 'no_show_flag',
      reason: 'No response on Zoom.',
      raisedByTutorId: 'tutor-1',
    });
    expect(attendanceRepositoryMock.insertAttendanceExceptionSystem).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      batch_id: 'batch-1',
      session_date: '2026-07-01',
      exception_type: 'no_show_flag',
      raised_by_tutor_id: 'tutor-1',
      requested_present: null,
      reason: 'No response on Zoom.',
    });
  });
});

describe('listAttendanceExceptions', () => {
  it('requires admin or management', async () => {
    attendanceRepositoryMock.selectAttendanceExceptions.mockResolvedValue([]);
    attendanceRepositoryMock.selectParticipantInfoForRegistrations.mockResolvedValue(new Map());
    await listAttendanceExceptions();
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'management']);
  });
});

describe('reviewAttendanceException', () => {
  it('rejects reviewing an already-reviewed exception', async () => {
    attendanceRepositoryMock.selectAttendanceExceptionById.mockResolvedValue({
      id: 'exc-1',
      status: 'approved',
      exception_type: 'no_show_flag',
      registration_id: 'reg-1',
      session_date: '2026-07-01',
      requested_present: null,
    });
    await expect(reviewAttendanceException('exc-1', 'approved')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(attendanceRepositoryMock.applyManualAttendanceCorrection).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an unknown exception', async () => {
    attendanceRepositoryMock.selectAttendanceExceptionById.mockResolvedValue(null);
    await expect(reviewAttendanceException('missing', 'approved')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('approving a no_show_flag never touches attendance data', async () => {
    attendanceRepositoryMock.selectAttendanceExceptionById.mockResolvedValue({
      id: 'exc-1',
      status: 'pending',
      exception_type: 'no_show_flag',
      registration_id: 'reg-1',
      session_date: '2026-07-01',
      requested_present: null,
    });
    await reviewAttendanceException('exc-1', 'approved', 'Confirmed with the tutor.');
    expect(attendanceRepositoryMock.applyManualAttendanceCorrection).not.toHaveBeenCalled();
    expect(attendanceRepositoryMock.updateAttendanceExceptionById).toHaveBeenCalledWith('exc-1', {
      status: 'approved',
      reviewed_by: 'staff-1',
      reviewed_at: expect.any(String),
      review_note: 'Confirmed with the tutor.',
    });
  });

  it('approving a correction_request applies the correction before marking reviewed', async () => {
    attendanceRepositoryMock.selectAttendanceExceptionById.mockResolvedValue({
      id: 'exc-1',
      status: 'pending',
      exception_type: 'correction_request',
      registration_id: 'reg-1',
      session_date: '2026-07-01',
      requested_present: true,
    });
    await reviewAttendanceException('exc-1', 'approved');
    expect(attendanceRepositoryMock.applyManualAttendanceCorrection).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      session_date: '2026-07-01',
      present: true,
    });
  });

  it('rejecting a correction_request never applies any correction', async () => {
    attendanceRepositoryMock.selectAttendanceExceptionById.mockResolvedValue({
      id: 'exc-1',
      status: 'pending',
      exception_type: 'correction_request',
      registration_id: 'reg-1',
      session_date: '2026-07-01',
      requested_present: false,
    });
    await reviewAttendanceException('exc-1', 'rejected');
    expect(attendanceRepositoryMock.applyManualAttendanceCorrection).not.toHaveBeenCalled();
  });
});

describe('tutor-portal attendance read uses the service-role path', () => {
  it('getAttendanceForBatchSystem reads via the system repository function', async () => {
    attendanceRepositoryMock.selectAttendanceForBatchSystem.mockResolvedValue([]);
    await getAttendanceForBatchSystem('batch-1');
    expect(attendanceRepositoryMock.selectAttendanceForBatchSystem).toHaveBeenCalledWith('batch-1');
    expect(attendanceRepositoryMock.selectAttendanceForBatch).not.toHaveBeenCalled();
  });

  it('getAttendanceForBatch (staff) still uses the RLS-gated repository function', async () => {
    attendanceRepositoryMock.selectAttendanceForBatch.mockResolvedValue([]);
    await getAttendanceForBatch('batch-1');
    expect(attendanceRepositoryMock.selectAttendanceForBatch).toHaveBeenCalledWith('batch-1');
    expect(attendanceRepositoryMock.selectAttendanceForBatchSystem).not.toHaveBeenCalled();
  });
});
