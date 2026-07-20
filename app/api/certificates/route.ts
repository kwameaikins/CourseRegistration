import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';
import * as usersService from '@/modules/users/service';
import { manualIssueSchema } from '@/modules/certificates/types';

// GET /api/certificates — the registry (admin + management read).
export async function GET() {
  try {
    await usersService.requireRole(['admin', 'management']);
    const certificates = await certificatesService.listCertificates();
    return successResponse({ certificates });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/certificates — manual issue (admin only). Supports custom
// certificate numbers for backfilling the legacy Google Sheets registry.
export async function POST(request: Request) {
  try {
    const staffUser = await usersService.requireRole(['admin']);
    const parsed = manualIssueSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid certificate data.',
        400,
      );
    }
    const certificate = await certificatesService.issueManual(parsed.data, staffUser.id);
    return successResponse(certificate, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
