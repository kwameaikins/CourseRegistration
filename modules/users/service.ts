// Staff account business rules (US-A05). Account creation is admin-only —
// there is no self-service sign-up (Document 6, Section 1).
import { AppError } from '@/lib/errors';
import * as usersRepository from '@/modules/users/repository';
import type { StaffUser, StaffUserInput, StaffUserUpdate } from '@/modules/users/types';
import type { Database, StaffRole } from '@/lib/supabase/database.types';

function toStaffUser(row: Database['public']['Tables']['staff_users']['Row']): StaffUser {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
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
