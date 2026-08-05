import { cookies } from 'next/headers';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import { parseUploadedFile } from '@/lib/uploads';
import * as tutorsService from '@/modules/tutors/service';
import {
  TUTOR_PORTAL_SESSION_COOKIE,
  addTutorSessionMaterialSchema,
  uploadTutorSessionMaterialSchema,
} from '@/modules/tutors/types';

// POST /api/tutor-portal/materials — a tutor shares a learning resource for
// one of their own batches, as EITHER a link (JSON body, the original
// 2026-07-31 shape) or an uploaded file (multipart/form-data, added
// 2026-08-04). Branching on Content-Type keeps the existing JSON callers
// working untouched rather than forcing every client to multipart.
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(TUTOR_PORTAL_SESSION_COOKIE)?.value;

    const isMultipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
    if (isMultipart) {
      const formData = await request.formData();
      const parsed = uploadTutorSessionMaterialSchema.safeParse({
        batchId: formData.get('batchId') ?? undefined,
        liveSessionId: formData.get('liveSessionId') || undefined,
        title: formData.get('title') ?? undefined,
      });
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid material payload.',
          400,
        );
      }
      const file = await parseUploadedFile(formData, 'file', { label: 'Resource' });
      if (!file) {
        throw new AppError('VALIDATION_ERROR', 'Choose a file to upload.', 400);
      }
      const material = await tutorsService.uploadMaterialForBatch(sessionId, parsed.data, file);
      return successResponse(material, 201);
    }

    const parsed = addTutorSessionMaterialSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid material payload.', 400);
    }
    const material = await tutorsService.addMaterialForBatch(sessionId, parsed.data);
    return successResponse(material, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
