import { AppError, handleRouteError } from '@/lib/errors';
import {
  CATALOG_CACHE_CONTROL,
  assertCatalogApiKey,
  catalogCorsHeaders,
  handleCatalogOptions,
} from '@/lib/public-api';
import { getCatalogApiCourse } from '@/modules/courses/catalog-api';

// GET /api/public/catalog/[courseCode] — one programme, including its full
// marketing copy (`content`), for a WordPress detail page.
//
// `courseCode` IS the slug (AI05, ESG1, ERM1) and is matched
// case-insensitively, so /ai05 resolves the same as /AI05.
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseCode: string }> },
) {
  try {
    assertCatalogApiKey(request);

    const { courseCode } = await params;
    const course = await getCatalogApiCourse(courseCode);
    if (!course) {
      // 404 for both "no such course" and "course exists but has no scheduled
      // sessions" — from the consumer's side those are the same thing: there
      // is nothing here to show or register for.
      throw new AppError('NOT_FOUND', 'Programme not found.', 404);
    }

    return Response.json(
      { data: { course }, error: null },
      {
        headers: {
          ...catalogCorsHeaders(request),
          'Cache-Control': CATALOG_CACHE_CONTROL,
        },
      },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function OPTIONS(request: Request) {
  return handleCatalogOptions(request);
}
