import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import { parseUploadedFile } from '@/lib/uploads';
import * as liveSessionsService from '@/modules/live-sessions/service';
import {
  addSessionMaterialSchema,
  uploadSessionMaterialSchema,
} from '@/modules/live-sessions/types';

// GET /api/live-sessions/materials?batchId=... — staff view of the learning
// resources shared on a batch (tutor- or staff-authored, link or file).
// Admin/management gate lives in the service (matches the /live-sessions
// screen's role gate).
export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) {
      throw new AppError('VALIDATION_ERROR', 'batchId is required.', 400);
    }
    const materials = await liveSessionsService.getSessionMaterialsForBatch(batchId);
    return successResponse({ materials });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/live-sessions/materials — staff share a learning resource on any
// batch, as either a link (JSON) or an uploaded file (multipart), the same
// two shapes the tutor portal accepts. Admin-only, gated in the service.
export async function POST(request: Request) {
  try {
    const isMultipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');

    if (isMultipart) {
      const formData = await request.formData();
      const parsed = uploadSessionMaterialSchema.safeParse({
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
      const material = await liveSessionsService.uploadSessionMaterialFileAsStaff({
        batchId: parsed.data.batchId,
        liveSessionId: parsed.data.liveSessionId ?? null,
        title: parsed.data.title,
        file,
      });
      return successResponse(material, 201);
    }

    const parsed = addSessionMaterialSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid material payload.',
        400,
      );
    }
    const material = await liveSessionsService.addSessionMaterialAsStaff({
      batchId: parsed.data.batchId,
      liveSessionId: parsed.data.liveSessionId ?? null,
      title: parsed.data.title,
      link: parsed.data.link,
    });
    return successResponse(material, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
