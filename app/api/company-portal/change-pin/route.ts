import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { COMPANY_PORTAL_SESSION_COOKIE, companyPortalChangePinSchema } from '@/modules/corporate/types';

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const parsed = companyPortalChangePinSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid PIN.', 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COMPANY_PORTAL_SESSION_COOKIE)?.value;
    await corporateService.changeCompanyPin(sessionId, parsed.data);

    return successResponse({ changed: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
