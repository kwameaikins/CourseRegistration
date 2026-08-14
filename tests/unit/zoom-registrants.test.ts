import { beforeEach, describe, expect, it, vi } from 'vitest';

// Personal Zoom join links (attendance "Option 2") — the path that had never
// written a single zoom_registrants row account-wide despite the app holding
// meeting:write:registrant and every Paid transition calling it.
//
// Its own file rather than more cases in attendance-service.test.ts, whose Zoom
// mock is shared across ~40 sync/revocation cases that must keep
// isZoomConfigured() returning false.

const repositoryMock = {
  selectZoomContext: vi.fn(),
  selectZoomRegistrant: vi.fn(),
  insertZoomRegistrant: vi.fn(),
  deleteZoomRegistrantByRegistration: vi.fn(),
  selectBatchForBackfill: vi.fn(),
  selectRegistrationsMissingZoomRegistrant: vi.fn(),
};
const zoomClientMock = {
  isZoomConfigured: vi.fn(() => true),
  tryAddMeetingRegistrant: vi.fn(),
  getMeetingRegistrationState: vi.fn(),
  enableMeetingRegistration: vi.fn(),
  getMeetingParticipantsOn: vi.fn(),
  denyMeetingRegistrant: vi.fn(),
};
const communicationsMock = { sendEmailOnce: vi.fn() };
const errorsMock = { captureToSentry: vi.fn() };

vi.mock('@/modules/attendance/repository', () => repositoryMock);
vi.mock('@/lib/zoom/client', () => zoomClientMock);
vi.mock('@/modules/communications/service', () => communicationsMock);
vi.mock('@/modules/users/service', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/errors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/errors')>('@/lib/errors');
  return { ...actual, captureToSentry: errorsMock.captureToSentry };
});

const { ensureZoomRegistration, runZoomRegistrantBackfill } = await import(
  '@/modules/attendance/service'
);

const REGISTRATION_ID = 'reg-1';
const BATCH_ID = 'batch-1';
const MEETING_ID = '81234567890';

function context(overrides: Record<string, unknown> = {}) {
  return {
    batchZoomMeetingId: MEETING_ID,
    batchIsActive: true,
    participantEmail: 'ama@example.com',
    participantFirstName: 'Ama',
    participantSurname: 'Owusu',
    participantDeleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  zoomClientMock.isZoomConfigured.mockReturnValue(true);
  repositoryMock.selectZoomContext.mockResolvedValue(context());
  repositoryMock.selectZoomRegistrant.mockResolvedValue(null);
  repositoryMock.insertZoomRegistrant.mockResolvedValue('inserted');
  zoomClientMock.tryAddMeetingRegistrant.mockResolvedValue({
    ok: true,
    registrantId: 'zr-1',
    joinUrl: 'https://zoom.us/w/personal',
  });
  communicationsMock.sendEmailOnce.mockResolvedValue(undefined);
});

describe('ensureZoomRegistration', () => {
  it('registers and stores the personal join link', async () => {
    await expect(ensureZoomRegistration(REGISTRATION_ID)).resolves.toBe('registered');
    expect(repositoryMock.insertZoomRegistrant).toHaveBeenCalledWith({
      registration_id: REGISTRATION_ID,
      zoom_registrant_id: 'zr-1',
      join_url: 'https://zoom.us/w/personal',
    });
  });

  // The regression that mattered: a Zoom refusal used to THROW into callers
  // that only console.errored, so a permanent account-wide failure and a
  // success were indistinguishable. It must now be reported, not swallowed.
  it('returns failed and reports to Sentry when Zoom refuses, instead of throwing', async () => {
    zoomClientMock.tryAddMeetingRegistrant.mockResolvedValue({
      ok: false,
      message: 'Zoom API POST /meetings/81234567890/registrants failed 400: registration not enabled',
    });

    await expect(ensureZoomRegistration(REGISTRATION_ID)).resolves.toBe('failed');
    expect(errorsMock.captureToSentry).toHaveBeenCalledTimes(1);
    expect(repositoryMock.insertZoomRegistrant).not.toHaveBeenCalled();
  });

  it('does not send the join-link email when registration failed', async () => {
    zoomClientMock.tryAddMeetingRegistrant.mockResolvedValue({ ok: false, message: 'nope' });
    await ensureZoomRegistration(REGISTRATION_ID);
    expect(communicationsMock.sendEmailOnce).not.toHaveBeenCalled();
  });

  it('short-circuits the gates without calling Zoom', async () => {
    zoomClientMock.isZoomConfigured.mockReturnValue(false);
    await expect(ensureZoomRegistration(REGISTRATION_ID)).resolves.toBe('skipped_not_configured');

    zoomClientMock.isZoomConfigured.mockReturnValue(true);
    repositoryMock.selectZoomContext.mockResolvedValue(context({ batchZoomMeetingId: null }));
    await expect(ensureZoomRegistration(REGISTRATION_ID)).resolves.toBe('skipped_no_meeting');

    repositoryMock.selectZoomContext.mockResolvedValue(context({ participantDeleted: true }));
    await expect(ensureZoomRegistration(REGISTRATION_ID)).resolves.toBe('skipped_gated');

    expect(zoomClientMock.tryAddMeetingRegistrant).not.toHaveBeenCalled();
  });
});

describe('runZoomRegistrantBackfill', () => {
  beforeEach(() => {
    repositoryMock.selectBatchForBackfill.mockResolvedValue({
      id: BATCH_ID,
      zoom_meeting_id: MEETING_ID,
      start_date: '2026-08-01',
      end_date: '2026-08-30',
    });
    repositoryMock.selectRegistrationsMissingZoomRegistrant.mockResolvedValue([
      { registrationId: REGISTRATION_ID, email: 'ama@example.com', firstName: 'Ama', surname: 'Owusu' },
    ]);
    zoomClientMock.getMeetingRegistrationState.mockResolvedValue({
      registrationEnabled: true,
      approvalType: 0,
      registrationType: 1,
    });
  });

  it('defaults to a dry run and writes nothing', async () => {
    const result = await runZoomRegistrantBackfill({ batchId: BATCH_ID });

    expect(result.dryRun).toBe(true);
    expect(result.eligible).toBe(1);
    expect(result.outcomes[0].outcome).toBe('would_register');
    expect(zoomClientMock.tryAddMeetingRegistrant).not.toHaveBeenCalled();
    expect(repositoryMock.insertZoomRegistrant).not.toHaveBeenCalled();
  });

  it('reports the meeting registration state even on a dry run', async () => {
    zoomClientMock.getMeetingRegistrationState.mockResolvedValue({
      registrationEnabled: false,
      approvalType: 2,
      registrationType: null,
    });

    const result = await runZoomRegistrantBackfill({ batchId: BATCH_ID });

    // approval_type 2 is the entire diagnosis, and it costs nothing to read.
    expect(result.approvalType).toBe(2);
    expect(result.registrationEnabled).toBe(false);
    expect(result.errors.join(' ')).toContain('registration DISABLED');
  });

  it('does not attempt registrations against a meeting that refuses them', async () => {
    zoomClientMock.getMeetingRegistrationState.mockResolvedValue({
      registrationEnabled: false,
      approvalType: 2,
      registrationType: null,
    });

    const result = await runZoomRegistrantBackfill({ batchId: BATCH_ID, dryRun: false });

    expect(zoomClientMock.tryAddMeetingRegistrant).not.toHaveBeenCalled();
    expect(result.registered).toBe(0);
  });

  // Founder decision 2026-08-14: an existing Zoom meeting is never modified by
  // this application. There is no parameter to ask for it any more — these pin
  // that no path through the backfill can reach the PATCH, whatever it is
  // handed, including a stale caller still sending the removed flag.
  it('never modifies the meeting, even against a registration-disabled one', async () => {
    zoomClientMock.getMeetingRegistrationState.mockResolvedValue({
      registrationEnabled: false,
      approvalType: 2,
      registrationType: null,
    });

    for (const params of [
      { batchId: BATCH_ID },
      { batchId: BATCH_ID, dryRun: false },
      // A caller still sending the removed flag must be inert, not honoured.
      { batchId: BATCH_ID, dryRun: false, enableRegistration: true } as never,
    ]) {
      await runZoomRegistrantBackfill(params);
    }

    expect(zoomClientMock.enableMeetingRegistration).not.toHaveBeenCalled();
  });

  it('explains that a disabled meeting stays that way, rather than offering a repair', async () => {
    zoomClientMock.getMeetingRegistrationState.mockResolvedValue({
      registrationEnabled: false,
      approvalType: 2,
      registrationType: null,
    });

    const result = await runZoomRegistrantBackfill({ batchId: BATCH_ID, dryRun: false });

    expect(result.errors.join(' ')).toContain('does not modify existing Zoom meetings');
    expect(result.registered).toBe(0);
  });

  it('counts failures without aborting the rest of the batch', async () => {
    repositoryMock.selectRegistrationsMissingZoomRegistrant.mockResolvedValue([
      { registrationId: 'reg-1', email: 'a@example.com', firstName: 'A', surname: 'One' },
      { registrationId: 'reg-2', email: 'b@example.com', firstName: 'B', surname: 'Two' },
    ]);
    zoomClientMock.tryAddMeetingRegistrant
      .mockResolvedValueOnce({ ok: false, message: 'Zoom said no' })
      .mockResolvedValueOnce({ ok: true, registrantId: 'zr-2', joinUrl: 'https://zoom.us/w/2' });

    const result = await runZoomRegistrantBackfill({ batchId: BATCH_ID, dryRun: false });

    expect(result.failed).toBe(1);
    expect(result.registered).toBe(1);
    expect(result.outcomes).toHaveLength(2);
  });

  it('stops with a clear error when the batch has no meeting', async () => {
    repositoryMock.selectBatchForBackfill.mockResolvedValue({
      id: BATCH_ID,
      zoom_meeting_id: null,
      start_date: '2026-08-01',
      end_date: '2026-08-30',
    });

    const result = await runZoomRegistrantBackfill({ batchId: BATCH_ID, dryRun: false });

    expect(result.errors.join(' ')).toContain('no zoom_meeting_id');
    expect(zoomClientMock.getMeetingRegistrationState).not.toHaveBeenCalled();
  });

  it('stops when Zoom is not configured', async () => {
    zoomClientMock.isZoomConfigured.mockReturnValue(false);
    const result = await runZoomRegistrantBackfill({ batchId: BATCH_ID, dryRun: false });
    expect(result.errors.join(' ')).toContain('not configured');
    expect(repositoryMock.selectBatchForBackfill).not.toHaveBeenCalled();
  });
});
