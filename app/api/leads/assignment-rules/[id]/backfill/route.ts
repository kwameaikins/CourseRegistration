import { handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import * as usersService from '@/modules/users/service';

// POST /api/leads/assignment-rules/[id]/backfill — explicit, staff-
// triggered action: applies an active rule to leads that are STILL
// unassigned (never reassigns a lead someone already claimed). Admin-only,
// matching every other write on this screen.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin']);
    const { id } = await params;
    const result = await leadsService.backfillAssignmentRule(id);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
