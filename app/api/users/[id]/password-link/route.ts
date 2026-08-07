import { handleRouteError, successResponse } from '@/lib/errors';
import * as usersService from '@/modules/users/service';

// POST /api/users/[id]/password-link — admin only. Emails the staff member a
// fresh single-use link to set their password, for when the original
// invitation never arrived or they never completed it.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await usersService.sendStaffPasswordSetupLink(id);
    return successResponse({ sent: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
