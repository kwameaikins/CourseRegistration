import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// KnowsiaApp account link / handoff — Seam I of platform convergence
// (Coding Docs/19_Platform_Convergence.md §4). Its own file rather than more
// cases bolted onto portal-service.test.ts, because every test here needs
// KNOWSIA_APP_* env vars set and that would leak into the ~40 unrelated cases
// in the shared file.

const repositoryMock = {
  selectSession: vi.fn(),
  selectKnowsiaAppLink: vi.fn(),
  insertKnowsiaAppHandoffToken: vi.fn(),
  consumeKnowsiaAppHandoffToken: vi.fn(),
  updateKnowsiaAppLink: vi.fn(),
};

vi.mock('@/modules/portal/repository', () => repositoryMock);
vi.mock('@/modules/payments/repository', () => ({}));
vi.mock('@/modules/certificates/service', () => ({}));
vi.mock('@/modules/courses/service', () => ({}));
vi.mock('@/modules/feedback/service', () => ({}));
vi.mock('@/lib/resend/client', () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock('@/modules/access-grants/service', () => ({ getAccessStatesSystem: vi.fn() }));

const {
  isKnowsiaAppConfigured,
  issueKnowsiaAppHandoff,
  redeemKnowsiaAppHandoff,
  linkKnowsiaAppUser,
} = await import('@/modules/portal/service');

const SESSION_ID = 'session-1';
const PARTICIPANT_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';
const APP_USER_ID = '33333333-3333-4333-8333-333333333333';

function liveSession() {
  return {
    participant_id: PARTICIPANT_ID,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_URL = 'https://app.knowsia.test';
  process.env.KNOWSIA_APP_SERVICE_KEY = 'test-service-key';
  repositoryMock.selectSession.mockResolvedValue(liveSession());
  repositoryMock.selectKnowsiaAppLink.mockResolvedValue({
    knowsiaAppUserId: null,
    deletedAt: null,
  });
  repositoryMock.insertKnowsiaAppHandoffToken.mockResolvedValue({ id: TOKEN_ID });
  repositoryMock.updateKnowsiaAppLink.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.KNOWSIA_APP_URL;
  delete process.env.KNOWSIA_APP_SERVICE_KEY;
});

describe('isKnowsiaAppConfigured', () => {
  it('is false unless BOTH variables are set', () => {
    expect(isKnowsiaAppConfigured()).toBe(true);

    delete process.env.KNOWSIA_APP_SERVICE_KEY;
    expect(isKnowsiaAppConfigured()).toBe(false);

    process.env.KNOWSIA_APP_SERVICE_KEY = 'test-service-key';
    delete process.env.KNOWSIA_APP_URL;
    expect(isKnowsiaAppConfigured()).toBe(false);
  });
});

describe('issueKnowsiaAppHandoff', () => {
  it('refuses without a session', async () => {
    await expect(issueKnowsiaAppHandoff(undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
    });
    expect(repositoryMock.insertKnowsiaAppHandoffToken).not.toHaveBeenCalled();
  });

  it('refuses on an expired session', async () => {
    repositoryMock.selectSession.mockResolvedValue({
      ...liveSession(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(issueKnowsiaAppHandoff(SESSION_ID)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(repositoryMock.insertKnowsiaAppHandoffToken).not.toHaveBeenCalled();
  });

  it('mints a token for the SESSION participant, not any supplied id', async () => {
    const result = await issueKnowsiaAppHandoff(SESSION_ID);

    // The whole security property of this endpoint: the participant comes from
    // the session lookup, and there is no parameter through which a caller
    // could ask for someone else's handoff.
    expect(repositoryMock.insertKnowsiaAppHandoffToken).toHaveBeenCalledWith(
      PARTICIPANT_ID,
      expect.any(String),
    );
    expect(result.token).toBe(TOKEN_ID);
    expect(result.url).toBe(`https://app.knowsia.test/auth/handoff?token=${TOKEN_ID}`);
  });

  it('expires the token in about 60 seconds, not the 15 minutes a PIN reset gets', async () => {
    const before = Date.now();
    const result = await issueKnowsiaAppHandoff(SESSION_ID);
    const ttlMs = new Date(result.expiresAt).getTime() - before;

    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(60_000);
  });

  it('strips a trailing slash from KNOWSIA_APP_URL rather than emitting a double slash', async () => {
    process.env.KNOWSIA_APP_URL = 'https://app.knowsia.test/';
    const result = await issueKnowsiaAppHandoff(SESSION_ID);
    expect(result.url).toBe(`https://app.knowsia.test/auth/handoff?token=${TOKEN_ID}`);
  });

  it('refuses when the integration is not configured', async () => {
    delete process.env.KNOWSIA_APP_URL;
    await expect(issueKnowsiaAppHandoff(SESSION_ID)).rejects.toMatchObject({
      code: 'KNOWSIA_APP_NOT_CONFIGURED',
      httpStatus: 503,
    });
    expect(repositoryMock.insertKnowsiaAppHandoffToken).not.toHaveBeenCalled();
  });

  it('refuses to hand a soft-deleted participant’s identity to another system', async () => {
    repositoryMock.selectKnowsiaAppLink.mockResolvedValue({
      knowsiaAppUserId: null,
      deletedAt: new Date().toISOString(),
    });
    await expect(issueKnowsiaAppHandoff(SESSION_ID)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(repositoryMock.insertKnowsiaAppHandoffToken).not.toHaveBeenCalled();
  });
});

describe('redeemKnowsiaAppHandoff', () => {
  it('returns identity on the first redemption', async () => {
    repositoryMock.consumeKnowsiaAppHandoffToken.mockResolvedValue({
      participantId: PARTICIPANT_ID,
      email: 'ama@example.com',
      fullName: 'Ama Owusu',
      phone: '0245121941',
      knowsiaAppUserId: null,
    });

    const identity = await redeemKnowsiaAppHandoff(TOKEN_ID);

    expect(identity.participantId).toBe(PARTICIPANT_ID);
    expect(identity.email).toBe('ama@example.com');
    // Identity only, never entitlement (BR-45) — no registration, payment or
    // access field may appear here, or Seam I quietly becomes Seam III.
    expect(identity).not.toHaveProperty('registrations');
    expect(identity).not.toHaveProperty('paymentStatus');
  });

  it('is single-use: a second redemption of the same token fails', async () => {
    repositoryMock.consumeKnowsiaAppHandoffToken
      .mockResolvedValueOnce({
        participantId: PARTICIPANT_ID,
        email: 'ama@example.com',
        fullName: 'Ama Owusu',
        phone: '0245121941',
        knowsiaAppUserId: null,
      })
      .mockResolvedValueOnce(null);

    await expect(redeemKnowsiaAppHandoff(TOKEN_ID)).resolves.toBeTruthy();
    await expect(redeemKnowsiaAppHandoff(TOKEN_ID)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      httpStatus: 400,
    });
  });

  it('fails on an expired or unknown token', async () => {
    repositoryMock.consumeKnowsiaAppHandoffToken.mockResolvedValue(null);
    await expect(redeemKnowsiaAppHandoff(TOKEN_ID)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });
});

describe('linkKnowsiaAppUser', () => {
  it('records a first link', async () => {
    await linkKnowsiaAppUser({
      participantId: PARTICIPANT_ID,
      knowsiaAppUserId: APP_USER_ID,
    });
    expect(repositoryMock.updateKnowsiaAppLink).toHaveBeenCalledWith(PARTICIPANT_ID, APP_USER_ID);
  });

  it('is idempotent — re-linking the same pair writes nothing', async () => {
    repositoryMock.selectKnowsiaAppLink.mockResolvedValue({
      knowsiaAppUserId: APP_USER_ID,
      deletedAt: null,
    });
    await linkKnowsiaAppUser({
      participantId: PARTICIPANT_ID,
      knowsiaAppUserId: APP_USER_ID,
    });
    expect(repositoryMock.updateKnowsiaAppLink).not.toHaveBeenCalled();
  });

  it('refuses to repoint an existing link at a different account', async () => {
    repositoryMock.selectKnowsiaAppLink.mockResolvedValue({
      knowsiaAppUserId: APP_USER_ID,
      deletedAt: null,
    });
    await expect(
      linkKnowsiaAppUser({
        participantId: PARTICIPANT_ID,
        knowsiaAppUserId: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_LINKED', httpStatus: 409 });
    expect(repositoryMock.updateKnowsiaAppLink).not.toHaveBeenCalled();
  });

  it('refuses an unknown or soft-deleted participant', async () => {
    repositoryMock.selectKnowsiaAppLink.mockResolvedValue(null);
    await expect(
      linkKnowsiaAppUser({ participantId: PARTICIPANT_ID, knowsiaAppUserId: APP_USER_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });

    repositoryMock.selectKnowsiaAppLink.mockResolvedValue({
      knowsiaAppUserId: null,
      deletedAt: new Date().toISOString(),
    });
    await expect(
      linkKnowsiaAppUser({ participantId: PARTICIPANT_ID, knowsiaAppUserId: APP_USER_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repositoryMock.updateKnowsiaAppLink).not.toHaveBeenCalled();
  });
});
