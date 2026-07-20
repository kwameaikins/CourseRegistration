import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
import { courseUpdateSchema } from '@/modules/courses/types';

// PATCH /api/courses/[id] — admin only. course_code is immutable (baked into
// issued certificate numbers).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await usersService.requireRole(['admin']);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      throw new AppError('NOT_FOUND', 'Course not found.', 404);
    }
    const parsed = courseUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid course data.',
        400,
      );
    }
    const course = await coursesService.updateCourse(id, parsed.data);
    return successResponse(course);
  } catch (err) {
    return handleRouteError(err);
  }
}
