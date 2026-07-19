import { handleRouteError, successResponse } from '@/lib/errors';
import * as voiceService from '@/modules/voice/service';
import * as usersService from '@/modules/users/service';

// GET /api/calls — recent voice calls with transcripts and follow-up flags.
// Admin + Finance + Management, matching the call_log RLS read policy.
export async function GET() {
  try {
    await usersService.requireRole(['admin', 'finance', 'management']);
    const calls = await voiceService.getRecentCalls();
    return successResponse({ calls });
  } catch (err) {
    return handleRouteError(err);
  }
}
