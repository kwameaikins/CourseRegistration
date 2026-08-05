import { handleRouteError } from '@/lib/errors';
import {
  CATALOG_CACHE_CONTROL,
  assertCatalogApiKey,
  catalogCorsHeaders,
  handleCatalogOptions,
} from '@/lib/public-api';
import { getCatalogApiCourses } from '@/modules/courses/catalog-api';

// GET /api/public/catalog — the live programme catalogue as JSON, for
// knowsia.com (WordPress) to render on its own site.
//
// Deliberately NOT at /api/courses: that path already exists and is
// staff-authenticated (admin/finance/marketing/management read, admin-only
// create). The /api/public/ prefix marks the trust boundary in a codebase
// where every other route is gated.
//
// Requires `Authorization: Bearer <CATALOG_API_KEY>` — see lib/public-api.ts
// for why the token, not CORS, is the actual control here.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    assertCatalogApiKey(request);
    const courses = await getCatalogApiCourses();

    return Response.json(
      { data: { courses }, error: null },
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
