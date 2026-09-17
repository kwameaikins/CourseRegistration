import { errorResponse, handleRouteError } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';

// GET /api/integration/certificates/[number]/pdf — called by KnowsiaApp, never
// a browser (2026-09-17). The study platform proxies this to its own signed-in
// student, so a self-paced certificate is the same PDF a cohort participant
// downloads: same renderer, same logo, same signatures, same verify footer.
// Service-key gated; the public download stays keyed by the row UUID.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const authorization = request.headers.get('authorization');
  if (
    !process.env.KNOWSIA_APP_SERVICE_KEY ||
    authorization !== `Bearer ${process.env.KNOWSIA_APP_SERVICE_KEY}`
  ) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid service key.' }, 401);
  }
  try {
    const { number } = await params;
    if (!/^[A-Z]{3}-[A-Z0-9]{2,10}-\d{4}-\d{4}$/.test(number)) {
      return new Response('Not found', { status: 404 });
    }
    const { fileName, bytes } = await certificatesService.getCertificatePdfByNumber(number);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
