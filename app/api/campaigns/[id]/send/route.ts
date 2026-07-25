import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as campaignsService from '@/modules/campaigns/service';
import { sendCampaignInputSchema } from '@/modules/campaigns/types';
import * as usersService from '@/modules/users/service';

// POST /api/campaigns/[id]/send — explicit live send action. Queue remains
// a dry run; this endpoint is the only path that contacts a provider.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing']);
    const { id } = await params;
    const parsed = sendCampaignInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid send confirmation payload.', 400);
    }
    const result = await campaignsService.sendCampaign(id, parsed.data);
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
