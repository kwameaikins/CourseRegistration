import { handleRouteError, successResponse } from '@/lib/errors';
import * as campaignsService from '@/modules/campaigns/service';
import * as usersService from '@/modules/users/service';

// DRY RUN ONLY (Phase 2 scope, explicitly approved): records a preview
// message per matched lead for staff review. Never calls a real email/
// WhatsApp/SMS provider. See modules/campaigns/service.ts for details.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await usersService.requireRole(['admin', 'marketing']);
    const { id } = await params;
    const campaign = await campaignsService.queueCampaign(id);
    return successResponse(campaign);
  } catch (err) {
    return handleRouteError(err);
  }
}
