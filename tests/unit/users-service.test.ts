import { beforeEach, describe, expect, it, vi } from 'vitest';

// The repository is mocked wholesale so lib/supabase/* never loads, matching
// the convention used by every other service test in this directory.
// requireRole lives in the module under test and cannot be mocked, so the
// acting user is controlled through selectCurrentStaffUser instead.
const usersRepositoryMock = {
  selectCurrentStaffUser: vi.fn(),
  selectStaffUserById: vi.fn(),
  selectStaffUsers: vi.fn(),
  insertStaffUserWithAuthAccount: vi.fn(),
  updateStaffUserById: vi.fn(),
  generateStaffPasswordSetupLink: vi.fn(),
};
const resendMock = { sendTransactionalEmail: vi.fn() };

vi.mock('@/modules/users/repository', () => usersRepositoryMock);
vi.mock('@/lib/resend/client', () => resendMock);

const { getStaffAccountStatus, sendStaffPasswordSetupLink } = await import(
  '@/modules/users/service'
);

const ADMIN_ROW = {
  id: 'staff-admin',
  user_id: 'auth-admin',
  full_name: 'Ada Admin',
  email: 'ada@knowsia.com',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const TARGET_ROW = {
  ...ADMIN_ROW,
  id: 'staff-finance',
  user_id: 'auth-finance',
  full_name: 'Fred Finance',
  email: 'fred@knowsia.com',
  role: 'finance',
};

const ACTION_LINK = 'https://project.supabase.co/auth/v1/verify?token=abc&type=recovery';

beforeEach(() => {
  vi.clearAllMocks();
  usersRepositoryMock.selectCurrentStaffUser.mockResolvedValue(ADMIN_ROW);
  usersRepositoryMock.selectStaffUserById.mockResolvedValue(TARGET_ROW);
  usersRepositoryMock.generateStaffPasswordSetupLink.mockResolvedValue(ACTION_LINK);
  resendMock.sendTransactionalEmail.mockResolvedValue(undefined);
});

describe('sendStaffPasswordSetupLink — admin recovery for staff who cannot sign in', () => {
  it('emails the generated link to the staff member it belongs to', async () => {
    await sendStaffPasswordSetupLink('staff-finance');

    expect(usersRepositoryMock.generateStaffPasswordSetupLink).toHaveBeenCalledWith(
      'fred@knowsia.com',
    );
    expect(resendMock.sendTransactionalEmail).toHaveBeenCalledTimes(1);

    const email = resendMock.sendTransactionalEmail.mock.calls[0][0];
    // The link must reach the account holder, never the admin who clicked.
    expect(email.to).toBe('fred@knowsia.com');
    expect(email.html).toContain(ACTION_LINK);
  });

  it('is restricted to admins', async () => {
    usersRepositoryMock.selectCurrentStaffUser.mockResolvedValue({
      ...ADMIN_ROW,
      role: 'management',
    });

    await expect(sendStaffPasswordSetupLink('staff-finance')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // The gate must stop the flow before a usable credential link exists.
    expect(usersRepositoryMock.generateStaffPasswordSetupLink).not.toHaveBeenCalled();
    expect(resendMock.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller', async () => {
    usersRepositoryMock.selectCurrentStaffUser.mockResolvedValue(null);

    await expect(sendStaffPasswordSetupLink('staff-finance')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(usersRepositoryMock.generateStaffPasswordSetupLink).not.toHaveBeenCalled();
  });

  it('refuses to re-admit a deactivated account', async () => {
    usersRepositoryMock.selectStaffUserById.mockResolvedValue({
      ...TARGET_ROW,
      is_active: false,
    });

    await expect(sendStaffPasswordSetupLink('staff-finance')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(usersRepositoryMock.generateStaffPasswordSetupLink).not.toHaveBeenCalled();
    expect(resendMock.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('reports a missing staff account rather than emailing nobody', async () => {
    usersRepositoryMock.selectStaffUserById.mockResolvedValue(null);

    await expect(sendStaffPasswordSetupLink('does-not-exist')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(resendMock.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe('getStaffAccountStatus', () => {
  // The login screen shows a different remedy for each of these, so they must
  // not collapse into one "inactive" message.
  it('separates an absent staff record from a deactivated one', async () => {
    usersRepositoryMock.selectCurrentStaffUser.mockResolvedValue(null);
    await expect(getStaffAccountStatus()).resolves.toBe('no-account');

    usersRepositoryMock.selectCurrentStaffUser.mockResolvedValue({
      ...ADMIN_ROW,
      is_active: false,
    });
    await expect(getStaffAccountStatus()).resolves.toBe('inactive');

    usersRepositoryMock.selectCurrentStaffUser.mockResolvedValue(ADMIN_ROW);
    await expect(getStaffAccountStatus()).resolves.toBe('active');
  });
});
