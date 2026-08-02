import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as partnersService from '@/modules/partners/service';

// GET /api/partners/[id]/qr-code?code=XYZ — staff-side QR generation for
// any of a partner's own codes (marketing collateral, printed flyers, etc).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) {
      throw new AppError('VALIDATION_ERROR', 'code is required.', 400);
    }
    const codes = await partnersService.listCodes({ partnerId: id });
    if (!codes.some((c) => c.code === code.toUpperCase())) {
      throw new AppError('NOT_FOUND', 'That code does not belong to this partner.', 404);
    }
    const dataUrl = await partnersService.generateReferralQrDataUrl(code);
    return successResponse({ dataUrl });
  } catch (err) {
    return handleRouteError(err);
  }
}
