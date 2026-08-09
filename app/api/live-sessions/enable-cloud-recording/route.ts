import { handleRouteError, successResponse } from '@/lib/errors';
import * as liveSessionsService from '@/modules/live-sessions/service';

// POST /api/live-sessions/enable-cloud-recording — turn on cloud recording
// for every classroom meeting that already exists. Admin only.
//
// New meetings have recorded since 2026-08-08, but every room created before
// that was made without auto_recording — which is all of the ones currently
// teaching. Without this they never record, and no recording means no
// transcript for the post-session recap agent to read.
//
// Idempotent at Zoom's end, so re-running is harmless.
export async function POST() {
  try {
    const result = await liveSessionsService.enableCloudRecordingOnExistingMeetings();
    return successResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
