import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { createCodeInputSchema } from '@/modules/partners/types';

// GET /api/codes?partnerId= — staff list of coupon/attribution codes.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partnerId') ?? undefined;
    const codes = await partnersService.listCodes({ partnerId });
    return successResponse({ codes });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/codes — create a coupon/attribution code (admin/marketing).
export async function POST(request: Request) {
  try {
    const parsed = createCodeInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid code details.',
        400,
      );
    }
    const code = await partnersService.createCode(parsed.data);
    return successResponse(code, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
