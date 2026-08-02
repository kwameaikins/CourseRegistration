import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import * as paymentsService from '@/modules/payments/service';
import { PARTNER_SESSION_COOKIE, redeemCommissionCreditInputSchema } from '@/modules/partners/types';

// POST /api/partner-portal/redeem-credit — an Institutional/Strategic/
// publicly-applied Ambassador partner spends their own 'payable' commission
// balance as course-fee credit toward a referred student's registration.
// Composed directly here (rather than a modules/partners service function)
// since payments owns the fee mutation and partners deliberately never
// imports payments — same posture as the tutor/student portal equivalents.
export async function POST(request: Request) {
  try {
    const parsed = redeemCommissionCreditInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid redemption request.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
    const { partnerId } = await partnersService.requirePartnerPortalSession(sessionId);
    const result = await paymentsService.redeemCommissionCreditSystem(partnerId, parsed.data.commissionIds, {
      registrationId: parsed.data.targetRegistrationId,
      participantEmail: parsed.data.targetParticipantEmail,
    });
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
