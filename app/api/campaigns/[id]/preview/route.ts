import { handleRouteError, successResponse } from '@/lib/errors';
import * as campaignsService from '@/modules/campaigns/service';
import * as usersService from '@/modules/users/service';

// DRY RUN ONLY: computes the matching audience and a sample of rendered
// messages without persisting anything or contacting any send provider.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const preview = await campaignsService.previewCampaign(id);
    return successResponse(preview);
  } catch (err) {
    return handleRouteError(err);
  }
}
