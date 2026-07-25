import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as campaignsService from '@/modules/campaigns/service';
import {
  CAMPAIGN_CHANNELS,
  updateCampaignSendSettingInputSchema,
  type CampaignChannel,
} from '@/modules/campaigns/types';
import * as usersService from '@/modules/users/service';

export async function GET() {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const settings = await campaignsService.listSendSettings();
    return successResponse({ settings });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const staffUser = await usersService.requireRole(['admin']);
    const rawBody: unknown = await request.json();
    const body =
      rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : {};
    const channel = typeof body?.channel === 'string' ? body.channel : '';
    if (!CAMPAIGN_CHANNELS.includes(channel as CampaignChannel)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid campaign channel.', 400);
    }
    const parsed = updateCampaignSendSettingInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid send setting payload.', 400);
    }
    const setting = await campaignsService.updateSendSetting(
      channel as CampaignChannel,
      parsed.data.liveEnabled,
      staffUser.id,
    );
    return successResponse(setting);
  } catch (err) {
    return handleRouteError(err);
  }
}
