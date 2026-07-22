import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectParticipantByIdentifier: vi.fn(),
  selectParticipantAuth: vi.fn(),
  insertParticipantAuthIfMissing: vi.fn(),
  recordFailedLogin: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
  updateParticipantPin: vi.fn(),
  insertSession: vi.fn(),
  selectSession: vi.fn(),
  revokeSession: vi.fn(),
  selectAllActiveParticipants: vi.fn(),
  selectPortalDashboardData: vi.fn(),
};

vi.mock('@/modules/portal/repository', () => repositoryMock);

const { login, changePin, ensureParticipantAuth, backfillParticipantAuth, requirePortalSession } =
  await import('@/modules/portal/service');
const { hashPin } = await import('@/lib/portal-auth/pin');

const PARTICIPANT = {
  id: 'participant-1',
  full_name: 'Ama Owusu',
  email: 'ama@example.com',
  phone: '0245121941',
  deleted_at: null,
};

function authRow(overrides: Record<string, unknown> = {}) {
  return {
    participant_id: 'participant-1',
    pin_hash: hashPin('1941'),
    must_change_pin: true,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMock.selectParticipantByIdentifier.mockResolvedValue(PARTICIPANT);
  repositoryMock.selectParticipantAuth.mockResolvedValue(authRow());
  repositoryMock.insertSession.mockResolvedValue({
    id: 'session-1',
    participant_id: 'participant-1',
  });
  repositoryMock.selectSession.mockResolvedValue({
    id: 'session-1',
    participant_id: 'participant-1',
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
});

describe('login', () => {
  it('succeeds with the correct PIN and returns mustChangePin from the auth row', async () => {
    const result = await login({ identifier: 'ama@example.com', pin: '1941' });
    expect(result).toMatchObject({ status: 'ok', sessionId: 'session-1', mustChangePin: true });
    expect(repositoryMock.recordSuccessfulLogin).toHaveBeenCalledWith('participant-1');
  });

  it('returns the same generic "invalid" status for an unknown identifier as a wrong PIN (no enumeration)', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(null);
    const unknownResult = await login({ identifier: 'nobody@example.com', pin: '1941' });

    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(PARTICIPANT);
    const wrongPinResult = await login({ identifier: 'ama@example.com', pin: '0000' });

    expect(unknownResult.status).toBe('invalid');
    expect(wrongPinResult.status).toBe('invalid');
  });

  it('never calls recordFailedLogin for an unknown identifier (nothing to update)', async () => {
    repositoryMock.selectParticipantByIdentifier.mockResolvedValue(null);
    await login({ identifier: 'nobody@example.com', pin: '1941' });
    expect(repositoryMock.recordFailedLogin).not.toHaveBeenCalled();
  });

  it('increments failed_attempts on a wrong PIN without locking below the threshold', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(authRow({ failed_attempts: 2 }));
    const result = await login({ identifier: 'ama@example.com', pin: '0000' });

    expect(result.status).toBe('invalid');
    expect(repositoryMock.recordFailedLogin).toHaveBeenCalledWith('participant-1', {
      failed_attempts: 3,
      locked_until: null,
    });
  });

  it('locks the account on the 5th consecutive failed attempt', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(authRow({ failed_attempts: 4 }));
    const result = await login({ identifier: 'ama@example.com', pin: '0000' });

    expect(result.status).toBe('locked');
    const call = repositoryMock.recordFailedLogin.mock.calls[0][1];
    expect(call.failed_attempts).toBe(0);
    expect(new Date(call.locked_until).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects immediately (no PIN check) while locked_until is in the future', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(
      authRow({ locked_until: new Date(Date.now() + 60_000).toISOString() }),
    );
    const result = await login({ identifier: 'ama@example.com', pin: '1941' });

    expect(result.status).toBe('locked');
    expect(repositoryMock.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it('allows login again once locked_until has passed', async () => {
    repositoryMock.selectParticipantAuth.mockResolvedValue(
      authRow({ locked_until: new Date(Date.now() - 60_000).toISOString() }),
    );
    const result = await login({ identifier: 'ama@example.com', pin: '1941' });
    expect(result.status).toBe('ok');
  });
});

describe('changePin', () => {
  it('rejects when the current PIN is wrong', async () => {
    await expect(
      changePin('session-1', { currentPin: '0000', newPin: '1234' }),
    ).rejects.toMatchObject({ code: 'INVALID_PIN' });
    expect(repositoryMock.updateParticipantPin).not.toHaveBeenCalled();
  });

  it('updates the PIN when the current PIN is correct', async () => {
    repositoryMock.selectSession.mockResolvedValue({
      id: 'session-1',
      participant_id: 'participant-1',
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await changePin('session-1', { currentPin: '1941', newPin: '1234' });
    expect(repositoryMock.updateParticipantPin).toHaveBeenCalledWith(
      'participant-1',
      expect.any(String),
    );
  });
});

describe('requirePortalSession', () => {
  it('rejects a missing session id', async () => {
    await expect(requirePortalSession(undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an expired session', async () => {
    repositoryMock.selectSession.mockResolvedValue({
      id: 'session-1',
      participant_id: 'participant-1',
      revoked_at: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(requirePortalSession('session-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a revoked session', async () => {
    repositoryMock.selectSession.mockResolvedValue({
      id: 'session-1',
      participant_id: 'participant-1',
      revoked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await expect(requirePortalSession('session-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('ensureParticipantAuth', () => {
  it('seeds an auth row hashed from the last 4 phone digits', async () => {
    await ensureParticipantAuth('participant-2', '0245121941');
    expect(repositoryMock.insertParticipantAuthIfMissing).toHaveBeenCalledWith(
      'participant-2',
      expect.any(String),
    );
  });

  it('does nothing when the phone has fewer than 4 digits', async () => {
    await ensureParticipantAuth('participant-2', '12');
    expect(repositoryMock.insertParticipantAuthIfMissing).not.toHaveBeenCalled();
  });
});

describe('backfillParticipantAuth', () => {
  it('only seeds participants that do not already have an auth row', async () => {
    repositoryMock.selectAllActiveParticipants.mockResolvedValue([
      { id: 'p-1', phone: '0245121941' },
      { id: 'p-2', phone: '0207654321' },
    ]);
    repositoryMock.selectParticipantAuth.mockImplementation(async (id: string) =>
      id === 'p-1' ? authRow({ participant_id: 'p-1' }) : null,
    );

    const result = await backfillParticipantAuth();

    expect(result).toEqual({ totalParticipants: 2, seeded: 1 });
    expect(repositoryMock.insertParticipantAuthIfMissing).toHaveBeenCalledTimes(1);
    expect(repositoryMock.insertParticipantAuthIfMissing).toHaveBeenCalledWith(
      'p-2',
      expect.any(String),
    );
  });
});
