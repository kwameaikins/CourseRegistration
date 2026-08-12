import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';
import * as registrationsService from '@/modules/registrations/service';
import { enrolExistingParticipantSchema } from '@/modules/registrations/types';
import { REFERRAL_CODE_COOKIE } from '@/modules/partners/types';

// POST /api/portal/enrol — one-click enrolment for a Participant who already
// has an account (BR-42, founder direction 2026-08-12).
//
// Composes the two modules here rather than having one call the other:
// portal answers "who is this", registrations owns creating the Registration.
// (registrations/service.ts already imports portal/service for
// ensureParticipantAuth, so a call the other way would make them circular.)
//
// The session cookie IS the identity — nothing about who is enrolling comes
// from the request body, so this endpoint cannot register anyone but its
// caller.
//
// Returns exactly what POST /api/registrations returns, including the
// 'waitlisted' outcome for a full Batch, because it ends in the same
// createRegistration. The portal branches on `outcome` as the public form does.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }

    const parsed = enrolExistingParticipantSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Please choose a course and try again.', 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const { participantId } = await portalService.requirePortalSession(sessionId);

    // A returning student can still arrive through a partner's tracked link, so
    // the same 30-day attribution cookie the public form honours is read here
    // too. The partner module's existing-lead and self-referral checks still
    // apply inside createRegistration — nothing is relaxed by the caller being
    // authenticated.
    const referralCookieCode = cookieStore.get(REFERRAL_CODE_COOKIE)?.value ?? null;

    const result = await registrationsService.enrolExistingParticipant(
      participantId,
      parsed.data,
      referralCookieCode,
    );
    return successResponse(result, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
