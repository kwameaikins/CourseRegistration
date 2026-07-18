import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
import { courseInputSchema } from '@/modules/courses/types';

// GET /api/courses — staff, all roles (RLS grants read to every role).
export async function GET() {
  try {
    await usersService.requireRole(['admin', 'finance', 'marketing', 'tutor', 'management']);
    const courses = await coursesService.getCourses();
    return successResponse({ courses });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/courses — admin only (Document 5, Section 4).
export async function POST(request: Request) {
  try {
    const staffUser = await usersService.getCurrentStaffUser();
    if (!staffUser) {
      throw new AppError('UNAUTHENTICATED', 'You must be signed in.', 401);
    }
    if (staffUser.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Only Admin users can create courses.', 403);
    }

    const parsed = courseInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Course code and name are required.', 400);
    }

    const course = await coursesService.createCourse(parsed.data);
    return successResponse(course, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
