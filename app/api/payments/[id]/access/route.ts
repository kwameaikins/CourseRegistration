import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as accessGrantsService from '@/modules/access-grants/service';
import {
  grantAccessInputSchema,
  revokeAccessInputSchema,
} from '@/modules/access-grants/types';

// [id] is the registrationId throughout, matching the sibling discount and
// coupon routes on this resource.

// GET — the grant history for one registration, newest first. Finance and
// admin only (enforced in the service layer).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: registrationId } = await params;
    const grants = await accessGrantsService.listGrantsForRegistration(registrationId);
    return successResponse({ grants });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST — grant or extend time-boxed access for an unsettled balance. Finance
// is capped at a cumulative ceiling and admin is not; that check depends on
// the requested end date rather than the role alone, so it lives in the
// service layer (same split as the discount route's full-waiver rule).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: registrationId } = await params;
    const rawBody: unknown = await request.json();

    const parsed = grantAccessInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid access grant data.',
        400,
      );
    }

    const grant = await accessGrantsService.grantAccessAsStaff(registrationId, parsed.data);
    return successResponse(grant);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE — withdraw access early. Revokes every live grant on the
// registration, walks the seat back and kills the Zoom join link.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: registrationId } = await params;
    const rawBody: unknown = await request.json().catch(() => ({}));

    const parsed = revokeAccessInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'A reason is required to withdraw access.',
        400,
      );
    }

    const result = await accessGrantsService.revokeAccessAsStaff(
      registrationId,
      parsed.data.note,
    );
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
