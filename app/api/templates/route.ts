import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as communicationsService from '@/modules/communications/service';
import * as usersService from '@/modules/users/service';
import { templateUpsertSchema } from '@/modules/communications/types';

// GET /api/templates?courseId=... — admin messaging editor read.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin']);
    const courseId = new URL(request.url).searchParams.get('courseId');
    if (!courseId) {
      throw new AppError('VALIDATION_ERROR', 'courseId is required.', 400);
    }
    const templates = await communicationsService.getTemplatesForCourse(courseId);
    return successResponse({ templates });
  } catch (err) {
    return handleRouteError(err);
  }
}

// PUT /api/templates — admin upsert of one Course + Email Type template.
export async function PUT(request: Request) {
  try {
    await usersService.requireRole(['admin']);
    const parsed = templateUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid template data.',
        400,
      );
    }
    const template = await communicationsService.saveTemplate(parsed.data);
    return successResponse(template);
  } catch (err) {
    return handleRouteError(err);
  }
}
