import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';
import { partnerApplicationSchema } from '@/modules/partners/types';

// POST /api/partners/apply — public application form (Knowsia Growth
// Partner Programme, doc §5). Always lands as status='pending'; staff
// review it from app/(staff)/partners.
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }

    const parsed = partnerApplicationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Please check the highlighted fields and try again.',
        400,
      );
    }

    const partner = await partnersService.submitPartnerApplication(parsed.data);
    return successResponse(
      { id: partner.id, message: "Thanks for applying — we'll review your application and be in touch soon." },
      201,
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
