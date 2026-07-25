import { handleRouteError, successResponse } from '@/lib/errors';
import * as campaignsService from '@/modules/campaigns/service';
import * as usersService from '@/modules/users/service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const campaign = await campaignsService.getCampaignById(id);
    const members = await campaignsService.getCampaignMembers(id);
    return successResponse({ campaign, members });
  } catch (err) {
    return handleRouteError(err);
  }
}
