import { errorResponse } from '@/lib/errors';

// The KnowsiaApp trust boundary for /api/integration/* (Seam I, Doc 19 §4):
// the same inline Bearer check the handoff and certificate routes use, in one
// place for the one-portal merge routes (2026-10-15). Returns the 401 to send,
// or null when the caller holds the shared key.
export function rejectUnlessKnowsiaApp(request: Request): Response | null {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  return null;
}
