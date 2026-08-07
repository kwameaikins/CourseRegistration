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
  selectRegistrationMatchIndex: vi.fn(),
  selectBatchesForAttendanceSync: vi.fn(),
  selectBatchForBackfill: vi.fn(),
  upsertAttendance: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};
const zoomClientMock = {
  addMeetingRegistrant: vi.fn(),
  getMeetingParticipantsOn: vi.fn(),
  isZoomConfigured: vi.fn(() => false),
};

vi.mock('@/modules/attendance/repository', () => attendanceRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/communications/service', () => ({ sendEmailOnce: vi.fn() }));
vi.mock('@/lib/zoom/client', () => zoomClientMock);

const {
  raiseAttendanceException,
  listAttendanceExceptions,
  reviewAttendanceException,
  getAttendanceForBatch,
  getAttendanceForBatchSystem,
  matchByDisplayName,
  nameTokens,
  resolveBatchAttendance,
  runAttendanceBackfill,
  runAttendanceSync,
  sessionMinutesFrom,
} = await import('@/modules/attendance/service');
const { meetsAttendanceThreshold, MIN_ATTENDANCE_RATIO } = await import(
  '@/lib/attendance-constants'
);

const ADMIN_STAFF = { id: 'staff-1', fullName: 'Jane Doe', role: 'admin' };

// A Zoom participant row as the client normalizes it.
function joinRecord(overrides: Partial<{
  email: string; name: string; registrantId: string; instanceId: string;
  joinTime: string; leaveTime: string; durationSeconds: number;
}> = {}) {
  return {
    email: '',
    name: '',
    registrantId: '',
    instanceId: 'instance-1',
    joinTime: '2026-08-06T18:00:00Z',
    leaveTime: '2026-08-06T20:00:00Z',
    durationSeconds: 7200,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue(ADMIN_STAFF);
  zoomClientMock.isZoomConfigured.mockReturnValue(true);
  attendanceRepositoryMock.upsertAttendance.mockResolvedValue(undefined);
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

describe('nameTokens', () => {
  it('drops honorifics and post-nominals so they cannot count as a shared token', () => {
    expect(nameTokens('Isaac Adjin Bonney, CA')).toEqual(['isaac', 'adjin', 'bonney']);
    expect(nameTokens('Rev. Cynthia Kpelle')).toEqual(['cynthia', 'kpelle']);
  });

  it('drops single letters, punctuation and casing', () => {
    expect(nameTokens('Katherine S. A.')).toEqual(['katherine']);
    expect(nameTokens('  ELORM   ayiku ')).toEqual(['elorm', 'ayiku']);
  });
});

describe('matchByDisplayName (inference feeding a certificate gate — stays strict)', () => {
  const roster = [
    { registrationId: 'reg-1', name: 'Evelyn Naa-Dei Thompson' },
    { registrationId: 'reg-2', name: 'Augustine Mireku' },
    { registrationId: 'reg-3', name: 'Augustine Mensah' },
  ];

  it('matches on two shared name tokens', () => {
    expect(matchByDisplayName('Evelyn Naa-Dei Thompson', roster)).toBe('reg-1');
    expect(matchByDisplayName('Thompson Evelyn', roster)).toBe('reg-1');
  });

  it('refuses a single-token display name however distinctive', () => {
    expect(matchByDisplayName('Mireku', roster)).toBeNull();
    expect(matchByDisplayName('Tina', roster)).toBeNull();
  });

  it('refuses when two roster entries are equally plausible', () => {
    const ambiguous = [
      { registrationId: 'reg-a', name: 'Kofi Mensah Addo' },
      { registrationId: 'reg-b', name: 'Kofi Mensah Owusu' },
    ];
    expect(matchByDisplayName('Kofi Mensah', ambiguous)).toBeNull();
  });

  it('refuses device names and AI notetakers', () => {
    expect(matchByDisplayName('Samsung SM-A175F', roster)).toBeNull();
    expect(matchByDisplayName("Tina's Notetaker (Otter.ai)", roster)).toBeNull();
  });
});

// Founder-approved 2026-08-06 for the ESG2 backfill: one distinctive shared
// token is enough. Opt-in only — the nightly sync never runs at this level.
describe('matchByDisplayName with minSharedTokens: 1', () => {
  const roster = [
    { registrationId: 'reg-1', name: 'Eugene Kwabena Ampofo' },
    { registrationId: 'reg-2', name: 'Ama Serwaa Boateng' },
    { registrationId: 'reg-3', name: 'Kofi Mensah' },
    { registrationId: 'reg-4', name: 'Kofi Danso' },
  ];
  const loose = { minSharedTokens: 1 } as const;

  it('matches a lone distinctive surname that strict mode rejects', () => {
    expect(matchByDisplayName('Ampofo', roster)).toBeNull();
    expect(matchByDisplayName('Ampofo', roster, loose)).toBe('reg-1');
  });

  // A hyphenated surname is already two tokens, so strict handles it — the
  // loose tier is for genuinely single-word display names.
  it('needs no loosening for a hyphenated surname', () => {
    const hyphenated = [{ registrationId: 'reg-h', name: 'Eugene Owusu-Anane' }];
    expect(matchByDisplayName('Owusu-Anane', hyphenated)).toBe('reg-h');
  });

  it('still refuses a token shared by more than one registrant', () => {
    expect(matchByDisplayName('Kofi', roster, loose)).toBeNull();
  });

  it('still refuses a token too short to discriminate', () => {
    expect(matchByDisplayName('Ama', roster, loose)).toBeNull();
  });

  it('never lets the loose tier override genuine two-token ambiguity', () => {
    const twins = [
      { registrationId: 'reg-a', name: 'Kofi Mensah Addo' },
      { registrationId: 'reg-b', name: 'Kofi Mensah Owusu' },
    ];
    expect(matchByDisplayName('Kofi Mensah', twins, loose)).toBeNull();
  });

  it('prefers the two-token match when both tiers could fire', () => {
    expect(matchByDisplayName('Ama Serwaa Boateng', roster, loose)).toBe('reg-2');
  });

  it('still refuses AI notetakers and device names', () => {
    expect(matchByDisplayName('Samsung SM-A175F', roster, loose)).toBeNull();
    expect(matchByDisplayName('read.ai meeting notes', roster, loose)).toBeNull();
  });
});

describe('resolveBatchAttendance', () => {
  const index = {
    byRegistrantId: new Map([['zr-1', 'reg-1']]),
    byEmail: new Map([['ama@example.com', 'reg-2']]),
    roster: [
      { registrationId: 'reg-1', name: 'Kwame Asante' },
      { registrationId: 'reg-2', name: 'Ama Boateng' },
      { registrationId: 'reg-3', name: 'Yaw Oduro Mensah' },
    ],
  };

  beforeEach(() => {
    attendanceRepositoryMock.selectRegistrationMatchIndex.mockResolvedValue(index);
  });

  it('prefers registrant id, then email, then display name — and labels the source', async () => {
    zoomClientMock.getMeetingParticipantsOn.mockResolvedValue([
      joinRecord({ registrantId: 'zr-1', name: 'Whatever They Typed' }),
      joinRecord({ email: 'ama@example.com', name: 'AB' }),
      joinRecord({ name: 'Yaw Oduro Mensah' }),
      joinRecord({ name: 'Zoom user' }),
    ]);

    const outcome = await resolveBatchAttendance('batch-1', '999', '2026-08-06');

    expect(outcome.matchedByRegistrant).toBe(1);
    expect(outcome.matchedByEmail).toBe(1);
    expect(outcome.matchedByName).toBe(1);
    expect(outcome.unmatched).toEqual([{ name: 'Zoom user', email: '', minutes: 120 }]);
    expect(
      Object.fromEntries(outcome.aggregated.map((a) => [a.registrationId, a.source])),
    ).toEqual({ 'reg-1': 'zoom_sync', 'reg-2': 'zoom_sync', 'reg-3': 'zoom_name_match' });
  });

  it('sums rejoins into one row per registration per session date', async () => {
    zoomClientMock.getMeetingParticipantsOn.mockResolvedValue([
      joinRecord({
        registrantId: 'zr-1',
        joinTime: '2026-08-06T18:00:00Z',
        leaveTime: '2026-08-06T18:30:00Z',
        durationSeconds: 1800,
      }),
      joinRecord({
        registrantId: 'zr-1',
        joinTime: '2026-08-06T19:00:00Z',
        leaveTime: '2026-08-06T20:00:00Z',
        durationSeconds: 3600,
      }),
    ]);

    const outcome = await resolveBatchAttendance('batch-1', '999', '2026-08-06');

    expect(outcome.aggregated).toHaveLength(1);
    expect(outcome.aggregated[0]).toMatchObject({
      registrationId: 'reg-1',
      joinTime: '2026-08-06T18:00:00Z',
      leaveTime: '2026-08-06T20:00:00Z',
      durationSeconds: 5400,
    });
  });

  it('an observed match on any rejoin outranks an inferred one', async () => {
    zoomClientMock.getMeetingParticipantsOn.mockResolvedValue([
      joinRecord({ name: 'Kwame Asante' }),
      joinRecord({ registrantId: 'zr-1', name: 'phone' }),
    ]);

    const outcome = await resolveBatchAttendance('batch-1', '999', '2026-08-06');

    expect(outcome.aggregated).toHaveLength(1);
    expect(outcome.aggregated[0].source).toBe('zoom_sync');
  });

  it('covers every sitting of the meeting on the date, not just the last one', async () => {
    zoomClientMock.getMeetingParticipantsOn.mockResolvedValue([]);
    await resolveBatchAttendance('batch-1', '81420483944', '2026-08-06');
    expect(zoomClientMock.getMeetingParticipantsOn).toHaveBeenCalledWith(
      '81420483944',
      '2026-08-06',
    );
  });
});

describe('sessionMinutesFrom (denominator for the 40% rule)', () => {
  it('takes the LONGEST sitting, not the span of the whole day', () => {
    // 2026-08-06 ESG shape: a morning host check, the real class, and a
    // post-class reconnect. First-join-to-last-leave would say ~14 hours.
    const records = [
      joinRecord({ instanceId: 'morning-check', joinTime: '2026-08-06T07:41:50Z', leaveTime: '2026-08-06T07:44:00Z' }),
      joinRecord({ instanceId: 'class', joinTime: '2026-08-06T17:56:31Z', leaveTime: '2026-08-06T18:30:00Z' }),
      joinRecord({ instanceId: 'class', joinTime: '2026-08-06T18:10:00Z', leaveTime: '2026-08-06T20:51:12Z' }),
      joinRecord({ instanceId: 'reconnect', joinTime: '2026-08-06T21:31:09Z', leaveTime: '2026-08-06T21:33:00Z' }),
    ];
    expect(sessionMinutesFrom(records)).toBe(175);
  });

  it('returns null when no record carries usable timestamps', () => {
    expect(sessionMinutesFrom([])).toBeNull();
    expect(sessionMinutesFrom([joinRecord({ joinTime: '', leaveTime: '' })])).toBeNull();
  });
});

describe('meetsAttendanceThreshold (founder rule: at least 30% of the session)', () => {
  it('passes at the threshold and fails just below', () => {
    // 30% of the 175-minute ESG session is 52.5 minutes.
    expect(meetsAttendanceThreshold(53, 175)).toBe(true);
    expect(meetsAttendanceThreshold(52, 175)).toBe(false);
  });

  it('is driven by the shared constant, not a hard-coded ratio', () => {
    const session = 200;
    const atThreshold = Math.ceil(session * MIN_ATTENDANCE_RATIO);
    expect(meetsAttendanceThreshold(atThreshold, session)).toBe(true);
    expect(meetsAttendanceThreshold(Math.floor(session * MIN_ATTENDANCE_RATIO) - 1, session)).toBe(
      false,
    );
  });

  it('fails the brief appearances the ESG backfill exposed', () => {
    expect(meetsAttendanceThreshold(0, 175)).toBe(false);
    expect(meetsAttendanceThreshold(2, 175)).toBe(false);
    expect(meetsAttendanceThreshold(14, 175)).toBe(false);
  });

  it('counts a row as attended when the session length was never recorded', () => {
    expect(meetsAttendanceThreshold(1, null)).toBe(true);
    expect(meetsAttendanceThreshold(1, 0)).toBe(true);
  });
});

describe('resolveBatchAttendance records the session length', () => {
  it('stamps every row with the longest sitting that day', async () => {
    attendanceRepositoryMock.selectRegistrationMatchIndex.mockResolvedValue({
      byRegistrantId: new Map([['zr-1', 'reg-1']]),
      byEmail: new Map(),
      roster: [],
    });
    zoomClientMock.getMeetingParticipantsOn.mockResolvedValue([
      joinRecord({
        registrantId: 'zr-1',
        instanceId: 'class',
        joinTime: '2026-08-06T17:56:31Z',
        leaveTime: '2026-08-06T20:51:12Z',
        durationSeconds: 600,
      }),
    ]);

    const outcome = await resolveBatchAttendance('batch-1', '999', '2026-08-06');

    expect(outcome.aggregated[0].sessionMinutes).toBe(175);
  });
});

describe('runAttendanceSync', () => {
  it('reports an error instead of a silent success when Zoom is unconfigured', async () => {
    zoomClientMock.isZoomConfigured.mockReturnValue(false);
    const summary = await runAttendanceSync(new Date('2026-08-06T21:00:00Z'));
    expect(summary.errors).toHaveLength(1);
    expect(attendanceRepositoryMock.selectBatchesForAttendanceSync).not.toHaveBeenCalled();
  });

  it('collects a per-batch failure without aborting the remaining batches', async () => {
    attendanceRepositoryMock.selectBatchesForAttendanceSync.mockResolvedValue([
      { id: 'batch-1', zoom_meeting_id: '111' },
      { id: 'batch-2', zoom_meeting_id: '222' },
    ]);
    attendanceRepositoryMock.selectRegistrationMatchIndex.mockResolvedValue({
      byRegistrantId: new Map(),
      byEmail: new Map([['ama@example.com', 'reg-2']]),
      roster: [],
    });
    zoomClientMock.getMeetingParticipantsOn
      .mockRejectedValueOnce(new Error('Zoom API failed 400'))
      .mockResolvedValueOnce([joinRecord({ email: 'ama@example.com' })]);

    const summary = await runAttendanceSync(new Date('2026-08-06T21:00:00Z'));

    expect(summary.batchesEvaluated).toBe(2);
    expect(summary.errors).toHaveLength(1);
    expect(summary.rowsUpserted).toBe(1);
    expect(attendanceRepositoryMock.upsertAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ registration_id: 'reg-2', source: 'zoom_sync' }),
    );
  });
});

describe('runAttendanceBackfill', () => {
  beforeEach(() => {
    attendanceRepositoryMock.selectBatchForBackfill.mockResolvedValue({
      id: 'batch-1',
      zoom_meeting_id: '89951984118',
      start_date: '2026-07-25',
      end_date: '2026-07-25',
    });
    attendanceRepositoryMock.selectRegistrationMatchIndex.mockResolvedValue({
      byRegistrantId: new Map(),
      byEmail: new Map(),
      roster: [{ registrationId: 'reg-1', name: 'Evelyn Naa-Dei Thompson' }],
    });
    zoomClientMock.getMeetingParticipantsOn.mockResolvedValue([
      joinRecord({ name: 'Evelyn Naa-Dei Thompson', joinTime: '2026-07-25T09:50:00Z', leaveTime: '2026-07-25T15:59:00Z' }),
      joinRecord({ name: 'HP', joinTime: '2026-07-25T09:50:00Z', leaveTime: '2026-07-25T12:16:00Z' }),
    ]);
  });

  it('defaults to a dry run and writes nothing', async () => {
    const result = await runAttendanceBackfill({ batchId: 'batch-1' });
    expect(result.dryRun).toBe(true);
    expect(result.rowsUpserted).toBe(1);
    expect(result.unmatched).toEqual([
      { date: '2026-07-25', name: 'HP', email: '', minutes: 120 },
    ]);
    expect(attendanceRepositoryMock.upsertAttendance).not.toHaveBeenCalled();
  });

  it('writes only when explicitly told to', async () => {
    const result = await runAttendanceBackfill({ batchId: 'batch-1', dryRun: false });
    expect(result.rowsUpserted).toBe(1);
    expect(attendanceRepositoryMock.upsertAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ registration_id: 'reg-1', source: 'zoom_name_match' }),
    );
  });

  it('works on a Batch whose sync window has long closed', async () => {
    await runAttendanceBackfill({ batchId: 'batch-1', dates: ['2026-07-25'] });
    expect(attendanceRepositoryMock.selectBatchesForAttendanceSync).not.toHaveBeenCalled();
    expect(zoomClientMock.getMeetingParticipantsOn).toHaveBeenCalledWith(
      '89951984118',
      '2026-07-25',
    );
  });

  it('passes the loosened matching level through to the matcher', async () => {
    attendanceRepositoryMock.selectRegistrationMatchIndex.mockResolvedValue({
      byRegistrantId: new Map(),
      byEmail: new Map(),
      roster: [{ registrationId: 'reg-1', name: 'Eugene Kwabena Ampofo' }],
    });
    zoomClientMock.getMeetingParticipantsOn.mockResolvedValue([
      joinRecord({ name: 'Ampofo', joinTime: '2026-07-25T09:50:00Z' }),
    ]);

    const strict = await runAttendanceBackfill({ batchId: 'batch-1' });
    expect(strict.rowsUpserted).toBe(0);
    expect(strict.unmatchedParticipants).toBe(1);

    const loosened = await runAttendanceBackfill({ batchId: 'batch-1', minSharedTokens: 1 });
    expect(loosened.rowsUpserted).toBe(1);
    expect(loosened.unmatchedParticipants).toBe(0);
  });

  it('throws NOT_FOUND when the Batch has no Zoom meeting to sync from', async () => {
    attendanceRepositoryMock.selectBatchForBackfill.mockResolvedValue(null);
    await expect(runAttendanceBackfill({ batchId: 'batch-x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
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
