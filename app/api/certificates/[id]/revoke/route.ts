import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';
import * as usersService from '@/modules/users/service';

// POST /api/certificates/[id]/revoke — admin only. Revoked certificates stop
// downloading and verify as revoked (never silently disappear).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await usersService.requireRole(['admin']);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      throw new AppError('NOT_FOUND', 'Certificate not found.', 404);
    }
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    await certificatesService.revokeCertificate(id, String(body.reason ?? '').slice(0, 500));
    return successResponse({ revoked: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
