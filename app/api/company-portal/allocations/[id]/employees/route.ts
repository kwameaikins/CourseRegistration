import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { COMPANY_PORTAL_SESSION_COOKIE, addEmployeesInputSchema } from '@/modules/corporate/types';

// POST /api/company-portal/allocations/[id]/employees — the company's own
// self-service add-employees action, capped at its own purchased seats
// (enforced inside addEmployeesToAllocation) and scoped to allocations that
// belong to this company's own session (enforced in
// addEmployeesToOwnAllocation) — never a staff-supplied allocation id.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COMPANY_PORTAL_SESSION_COOKIE)?.value;

    const parsed = addEmployeesInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid employee list payload.', 400);
    }

    const result = await corporateService.addEmployeesToOwnAllocation(sessionId, id, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
