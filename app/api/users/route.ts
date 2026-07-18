import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as usersService from '@/modules/users/service';
import { staffUserInputSchema } from '@/modules/users/types';

// GET /api/users — admin only (Document 5, Section 11).
export async function GET() {
  try {
    const users = await usersService.getStaffUsers();
    return successResponse({ users });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/users — admin only. Creates the Supabase Auth user (invitation
// email) AND the staff_users row as one operation from the caller's view.
export async function POST(request: Request) {
  try {
    const parsed = staffUserInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'A valid email, full name, and role are required.',
        400,
      );
    }
    const user = await usersService.createStaffUser(parsed.data);
    return successResponse(user, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
