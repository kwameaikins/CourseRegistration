import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
import { batchUpdateSchema } from '@/modules/courses/types';

// PATCH /api/batches/[id] — admin only (Document 5, Section 5).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await usersService.requireRole(['admin']);
    const { id } = await params;
    const parsed = batchUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid batch data.',
        400,
      );
    }
    const batch = await coursesService.updateBatch(id, parsed.data);
    return successResponse(batch);
  } catch (err) {
    return handleRouteError(err);
  }
}
