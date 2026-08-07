// Staff account business rules (US-A05). Account creation is admin-only —
// there is no self-service sign-up (Document 6, Section 1).
import { parseStaffRole } from '@/lib/domain/parsers';
import { AppError } from '@/lib/errors';
import { sendTransactionalEmail } from '@/lib/resend/client';
import * as usersRepository from '@/modules/users/repository';
import type { StaffUser, StaffUserInput, StaffUserUpdate } from '@/modules/users/types';
import type { StaffRole } from '@/lib/domain/types';
import type { Database } from '@/lib/supabase/database.types';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

function toStaffUser(row: Database['public']['Tables']['staff_users']['Row']): StaffUser {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    role: parseStaffRole(row.role),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

// Exposed to other modules (Document 2, Section 4): the current session's
// staff identity, or null when unauthenticated/inactive.
export async function getCurrentStaffUser(): Promise<StaffUser | null> {
  const row = await usersRepository.selectCurrentStaffUser();
  if (!row || !row.is_active) return null;
  return toStaffUser(row);
}

// Why getCurrentStaffUser returned null. "No staff record for this Auth
// identity" and "account deactivated" need different remedies from the person
// reading the login screen, so they must not collapse into one message.
export async function getStaffAccountStatus(): Promise<'active' | 'inactive' | 'no-account'> {
  const row = await usersRepository.selectCurrentStaffUser();
  if (!row) return 'no-account';
  return row.is_active ? 'active' : 'inactive';
}

export async function requireRole(allowedRoles: StaffRole[]): Promise<StaffUser> {
  const staffUser = await getCurrentStaffUser();
  if (!staffUser) {
    throw new AppError('UNAUTHENTICATED', 'You must be signed in.', 401);
  }
  if (!allowedRoles.includes(staffUser.role)) {
    throw new AppError('FORBIDDEN', 'Your role does not permit this action.', 403);
  }
  return staffUser;
}

export async function getStaffUsers(): Promise<StaffUser[]> {
  await requireRole(['admin']);
  const rows = await usersRepository.selectStaffUsers();
  return rows.map(toStaffUser);
}

export async function createStaffUser(input: StaffUserInput): Promise<StaffUser> {
  await requireRole(['admin']);
  const row = await usersRepository.insertStaffUserWithAuthAccount({
    email: input.email.toLowerCase(),
    full_name: input.fullName,
    role: input.role,
  });
  return toStaffUser(row);
}

// Admin-triggered recovery for a staff member who cannot sign in — either the
// original invitation never arrived, or they never set a password and so
// signInWithPassword can only ever fail for them.
export async function sendStaffPasswordSetupLink(staffUserId: string): Promise<void> {
  await requireRole(['admin']);

  const row = await usersRepository.selectStaffUserById(staffUserId);
  if (!row) {
    throw new AppError('NOT_FOUND', 'That staff account no longer exists.', 404);
  }
  if (!row.is_active) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Reactivate this account before sending a password link.',
      400,
    );
  }

  const link = await usersRepository.generateStaffPasswordSetupLink(row.email);

  await sendTransactionalEmail({
    to: row.email,
    subject: 'Set your Knowsia staff password',
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a2e;max-width:600px;margin:0 auto;">
<p style="margin-bottom:24px;"><img src="${APP_URL()}/knowsia-logo.png" alt="Knowsia" width="140" style="display:block;" /></p>
<p>Dear ${row.full_name},</p>
<p>Use the button below to set the password for your Knowsia staff account (${row.email}). This link works once and expires in one hour.</p>
<p style="margin:24px 0;"><a href="${link}" style="background:#4B21A8;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Set my password</a></p>
<p>After setting it you can sign in any time at <a href="${APP_URL()}/login">${APP_URL()}/login</a>.</p>
<p>If you didn't expect this email, you can safely ignore it — your password will not change.</p>
<p style="margin-top:28px;">Warm regards,<br/><strong>The Knowsia Team</strong></p>
</div>`,
  });
}

export async function updateStaffUser(
  staffUserId: string,
  changes: StaffUserUpdate,
): Promise<StaffUser> {
  await requireRole(['admin']);
  const row = await usersRepository.updateStaffUserById(staffUserId, {
    ...(changes.fullName !== undefined && { full_name: changes.fullName }),
    ...(changes.role !== undefined && { role: changes.role }),
    ...(changes.isActive !== undefined && { is_active: changes.isActive }),
  });
  return toStaffUser(row);
}
