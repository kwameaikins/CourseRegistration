import { handleRouteError, successResponse } from '@/lib/errors';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    const rows = await usersService.getStaffUsers();
    return successResponse({ users: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
