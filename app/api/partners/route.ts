import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { createPartnerInputSchema } from '@/modules/partners/types';

// GET /api/partners?status=&category= — staff list across all 4 categories,
// including pending applications (admin/marketing, gated in the service).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const partners = await partnersService.listPartners({ status, category });
    return successResponse({ partners });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/partners — staff-direct creation (Tutor/Strategic Partners, or
// any category staff wants to add without the public application flow).
export async function POST(request: Request) {
  try {
    const parsed = createPartnerInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid partner details.', 400);
    }
    const partner = await partnersService.createPartner(parsed.data);
    return successResponse(partner, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
