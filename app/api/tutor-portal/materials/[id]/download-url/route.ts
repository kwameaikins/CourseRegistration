import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

// GET /api/tutor-portal/materials/[id]/download-url — a short-lived (5 min)
// presigned R2 URL for a file-backed material. The service verifies the
// material's batch belongs to this tutor before signing; file bytes never
// pass through our own server.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const url = await tutorsService.getMaterialDownloadUrl(sessionId, id);
    return successResponse({ url });
  } catch (err) {
    return handleRouteError(err);
  }
}
