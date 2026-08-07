import { parseDateRange } from '@/lib/date-range';
import { handleRouteError, successResponse } from '@/lib/errors';
import * as voiceService from '@/modules/voice/service';
import * as usersService from '@/modules/users/service';

// GET /api/calls — recent voice calls with transcripts and follow-up flags.
// Admin + Finance + Management, matching the call_log RLS read policy.
// Optional dateFrom / dateTo filter on call time.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'finance', 'management']);
    const range = parseDateRange(new URL(request.url).searchParams);
    const calls = await voiceService.getRecentCalls(100, range);
    return successResponse({ calls });
  } catch (err) {
    return handleRouteError(err);
  }
}
