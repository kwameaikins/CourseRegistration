import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';
import * as usersService from '@/modules/users/service';
import { batchIssueSchema } from '@/modules/certificates/types';

// GET /api/certificates/batch?batchId=... — eligibility context for batch
// issuance (admin only): Paid + feedback + attendance per registration.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin']);
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) {
      throw new AppError('VALIDATION_ERROR', 'batchId is required.', 400);
    }
    const context = await certificatesService.getBatchIssueContext(batchId);
    if (!context) {
      throw new AppError('NOT_FOUND', 'Batch not found.', 404);
    }
    return successResponse(context);
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/certificates/batch — issue for the admin-selected registrations.
export async function POST(request: Request) {
  try {
    const staffUser = await usersService.requireRole(['admin']);
    const parsed = batchIssueSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid batch issue request.',
        400,
      );
    }
    const result = await certificatesService.issueForBatch(parsed.data, staffUser.id);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
