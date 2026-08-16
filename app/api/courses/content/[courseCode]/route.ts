import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
import { courseContentSaveSchema } from '@/modules/courses/types';

// PUT /api/courses/content/[courseCode] — admin only, same gate as editing the
// course itself. PUT rather than PATCH because the editor always submits the
// whole document; a partial merge into nested curriculum arrays would be
// ambiguous about whether a missing module was deleted or simply not sent.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ courseCode: string }> },
) {
  try {
    await usersService.requireRole(['admin']);
    const { courseCode } = await params;
    const parsed = courseContentSaveSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AppError(
        'VALIDATION_ERROR',
        // Path included because the editor has dozens of fields and "Invalid
        // input" on its own would leave staff hunting for which one.
        issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid course content.',
        400,
      );
    }
    const record = await coursesService.saveCourseContent(courseCode, parsed.data);
    return successResponse(record);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/courses/content/[courseCode] — drops the saved override so the
// programme page renders from modules/courses/public-content.ts again. Not a
// destructive delete of the course's copy: for the courses that ship with code
// copy, this restores it.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseCode: string }> },
) {
  try {
    await usersService.requireRole(['admin']);
    const { courseCode } = await params;
    const record = await coursesService.resetCourseContentToCode(courseCode);
    return successResponse(record);
  } catch (err) {
    return handleRouteError(err);
  }
}
