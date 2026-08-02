import { cookies } from 'next/headers';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as tutorsService from '@/modules/tutors/service';
import { TUTOR_PORTAL_SESSION_COOKIE } from '@/modules/tutors/types';

// GET /api/tutor-portal/materials/[id] — here `id` is a batchId (list
// materials for that batch). Merged into the same route.ts as DELETE below
// (where `id` is a material id) because Next.js's App Router requires every
// sibling route at this path position to use the same dynamic segment name —
// this file used to be a separate [batchId] folder, which broke production
// routing entirely ("You cannot use different slug names for the same
// dynamic path") the moment both existed side by side.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: batchId } = await params;
    if (!z.uuid().safeParse(batchId).success) {
      return new Response('Not found', { status: 404 });
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    const materials = await tutorsService.getMaterialsForBatch(sessionId, batchId);
    return successResponse(materials);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!z.uuid().safeParse(id).success || !batchId || !z.uuid().safeParse(batchId).success) {
      throw new AppError('VALIDATION_ERROR', 'A valid material id and batchId are required.', 400);
    }
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;
    await tutorsService.removeMaterial(sessionId, id, batchId);
    return successResponse({ status: 'ok' });
  } catch (err) {
    return handleRouteError(err);
  }
}
