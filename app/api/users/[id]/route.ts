import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as usersService from '@/modules/users/service';
import { staffUserUpdateSchema } from '@/modules/users/types';

// PATCH /api/users/[id] — admin only (activate/deactivate, role changes).
// Deactivation takes effect on the account's next request: fn_current_role()
// checks is_active on every RLS evaluation (Document 6, Section 10).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = staffUserUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid staff user update.', 400);
    }
    const user = await usersService.updateStaffUser(id, parsed.data);
    return successResponse(user);
  } catch (err) {
    return handleRouteError(err);
  }
}
