import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
import { batchInputSchema } from '@/modules/courses/types';

// GET /api/batches?courseId=... — staff read (Tutor sees own only via RLS).
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'finance', 'marketing', 'tutor', 'management']);
    const courseId = new URL(request.url).searchParams.get('courseId') ?? undefined;
    const batches = await coursesService.getBatches(courseId);
    return successResponse({ batches });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/batches — admin only (Document 5, Section 5).
export async function POST(request: Request) {
  try {
    await usersService.requireRole(['admin']);
    const parsed = batchInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid batch data.',
        400,
      );
    }
    const batch = await coursesService.createBatch(parsed.data);
    return successResponse(batch, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
