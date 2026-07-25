import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as campaignsService from '@/modules/campaigns/service';
import { createCampaignInputSchema } from '@/modules/campaigns/types';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const campaigns = await campaignsService.listCampaigns();
    return successResponse({ campaigns });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    const staffUser = await usersService.requireRole(['admin', 'marketing']);
    const body = await request.json();
    const parsed = createCampaignInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid campaign payload.', 400);
    }
    const campaign = await campaignsService.createCampaign(parsed.data, staffUser.id);
    return successResponse(campaign, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
