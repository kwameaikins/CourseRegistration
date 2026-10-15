import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import { selectNextClassForParticipant } from '@/modules/live-sessions/portal-access';
import * as portalService from '@/modules/portal/service';

// GET /api/integration/participants/[id]/dashboard — called by KnowsiaApp,
// never a browser (one-portal merge Phase 2, 2026-10-15). The live-class half
// of the student portal for the participant KnowsiaApp has linked to its
// signed-in user: registrations, balances, Zoom links (access-gated exactly as
// the portal gates them), attendance, certificates, plus the next class.
// Read-only; the self-paced half is left out because the caller owns it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const [dashboard, nextClass] = await Promise.all([
      portalService.getPortalDashboardForParticipant(id, { includeSelfPaced: false }),
      selectNextClassForParticipant(id).catch(() => null),
    ]);
    return successResponse({ ...dashboard, nextClass });
  } catch (err) {
    return handleRouteError(err);
  }
}
