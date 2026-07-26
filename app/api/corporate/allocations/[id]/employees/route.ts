import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import * as usersService from '@/modules/users/service';
import { addEmployeesInputSchema } from '@/modules/corporate/types';

// POST /api/corporate/allocations/[id]/employees — staff-facing add-employees
// action. addEmployeesToAllocation itself has no role gate (it's also called
// from the company portal in Phase 2 under a company session, not a staff
// one) — this route is the staff-facing authorization boundary.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const staffUser = await usersService.requireRole(['admin', 'finance', 'marketing', 'management']);
    const { id } = await params;
    const parsed = addEmployeesInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid employee list payload.', 400);
    }
    const result = await corporateService.addEmployeesToAllocation(id, parsed.data, {
      id: staffUser.id,
      fullName: staffUser.fullName,
      role: staffUser.role,
    });
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
