import { handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';

// DELETE /api/codes/[id] — soft deactivate (is_active = false); a code is
// never hard-deleted since redemptions/commissions reference it.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await partnersService.deactivateCode(id);
    return successResponse({ deactivated: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
